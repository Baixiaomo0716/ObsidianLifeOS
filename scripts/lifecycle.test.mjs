import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import * as esbuild from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const compiled = await esbuild.build({
  entryPoints: ["src/main.ts"], bundle: true, platform: "browser", format: "cjs",
  write: false, logLevel: "silent", define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".md": "text" },
  external: ["obsidian", "react", "react/jsx-runtime", "react-dom/client"],
});

async function environment({ delayCreate = false, failCreate = false, failRender = false, settingsRaw } = {}) {
  const roots = [];
  const notices = [];
  const settings = [];
  let resumeCreate;
  const wait = delayCreate ? new Promise((resolve) => { resumeCreate = resolve; }) : Promise.resolve();

  class Element {
    constructor(document) {
      this.ownerDocument = document;
      this.children = [];
      this.classes = new Set();
      this.classList = { add: (value) => this.classes.add(value), remove: (value) => this.classes.delete(value) };
      this.textContent = "";
    }
    replaceChildren(...children) {
      for (const child of this.children) child.parent = null;
      this.children = [];
      for (const child of children) this.appendChild(child);
    }
    appendChild(child) { this.children.push(child); child.parent = this; return child; }
    setAttribute(name, value) { this[name] = value; }
    querySelector() { return this.children.find((child) => child.role === "status") ?? null; }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
  }
  const document = { createElement: () => new Element(document) };
  const hostSibling = document.createElement("div");
  hostSibling.textContent = "User note content";
  const registry = new Map();
  const workspace = {
    on() { return { name: "active-leaf-change" }; },
    onLayoutReady() {},
    leaves: [], created: 0, revealed: 0,
    getLeavesOfType(type) { return this.leaves.filter((leaf) => leaf.type === type); },
    getLeaf() {
      this.created += 1;
      const leaf = {
        type: null, view: null, detached: false,
        async setViewState(state) {
          await wait;
          if (failCreate) throw new Error("host create failed");
          const factory = registry.get(state.type);
          if (!factory) throw new Error("view unregistered");
          this.type = state.type;
          this.view = factory(this);
          await this.view.onOpen();
        },
        detach() {
          this.detached = true;
          if (this.view) void this.view.onClose();
          workspace.leaves = workspace.leaves.filter((item) => item !== this);
        },
      };
      this.leaves.push(leaf);
      return leaf;
    },
    async revealLeaf(leaf) {
      assert.ok(!leaf.detached);
      this.revealed += 1;
    },
    detachLeavesOfType(type) { for (const leaf of this.getLeavesOfType(type)) leaf.detach(); },
  };
  const events = new Map(), registered = [];
  const app = { workspace, vault: { getAbstractFileByPath(path) { return settingsRaw === undefined ? null : new TFile(path); }, async read() { return settingsRaw; }, on(name, handler) { events.set(name, handler); return { name }; } } };
  class Plugin {
    constructor() { this.app = app; this.commands = []; this.ribbons = []; }
    registerView(type, factory) { registry.set(type, factory); }
    registerEvent(event) { registered.push(event); }
    addCommand(command) { this.commands.push(command); }
    addRibbonIcon(icon, name, callback) { this.ribbons.push({ icon, name, callback }); }
    addSettingTab(tab) { this.settingTab = tab; }
  }
  class ItemView {
    constructor(leaf) { this.leaf = leaf; this.contentEl = document.createElement("div"); }
  }
  class PluginSettingTab {
    constructor() { this.containerEl = document.createElement("div"); }
  }
  class Setting {
    constructor(element) { this.element = element; settings.push(this); }
    setName(value) { this.name = value; return this; }
    setDesc(value) { this.description = value; return this; }
    addText(callback) { const text = { value: "", getValue: () => text.value, setValue: (value) => { text.value = value; return text; }, onChange: () => text }; this.text = text; callback(text); return this; }
    addToggle(callback) { const toggle = { setValue: () => toggle, onChange: () => toggle }; callback(toggle); return this; }
    addButton(callback) {
      const button = { setDisabled: () => button, setButtonText: () => button, onClick: (handler) => { this.click = handler; return button; } };
      callback(button); return this;
    }
  }
  class TFile { constructor(path) { this.path = path; } }
  class Modal {
    constructor() { this.contentEl = document.createElement("div"); this.modalEl = document.createElement("div"); }
    open() {}
    close() { this.onClose?.(); }
  }
  const obsidian = { Plugin, ItemView, PluginSettingTab, Setting, TFile, Modal, Notice: class { constructor(message) { notices.push(message); } } };
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, {
    module, exports: module.exports,
    require(name) {
      if (name === "obsidian") return obsidian;
      if (name === "react-dom/client") return {
        createRoot(element) {
          const root = {
            element, unmounts: 0, renders: 0,
            render(node) { this.node = node; this.renders += 1; if (failRender) throw new Error("render failed"); },
            unmount() { this.unmounts += 1; },
          };
          roots.push(root); return root;
        },
      };
      return require(name);
    },
  });
  const plugin = new module.exports.default();
  await plugin.onload();
  return { plugin, workspace, roots, notices, settings, resumeCreate, hostSibling, events, registered, TFile, app, setSettingsRaw(value) { settingsRaw = value; } };
}

const configuredSettings = JSON.stringify({ jiegoubanben: 2, genmulu: "生活档案", mulu: { riji: "10_日记", jizhang: "20_记账", yuedu: "30_阅读", yingshi: "40_影视", youxi: "45_游戏", yanchu: "50_演出", lvxing: "60_旅行", zhishi: "80_知识", daiban: "81_待办", xiangmu: "82_项目" }, qiyongmokuai: ["riji"], shiqu: "UTC", fujianzuidadaxiao: 1024, fenlei: [] });
test("plugin reload binds stores to persisted layout and settings", async () => {
  const e = await environment({ settingsRaw: configuredSettings });
  assert.equal(e.plugin.stores.layout.root, "生活档案"); assert.equal(e.plugin.activeSettings.shiqu, "UTC");
  assert.equal(e.plugin.activeSettings.qiyongmokuai.length, 1);
});
test("opening a new ledger reloads categories saved after the workspace opened", async () => {
  const e = await environment();
  const updated = JSON.parse(configuredSettings);
  updated.qiyongmokuai.push("jizhang");
  updated.fenlei = [{ shouzhi: "zhichu", fenlei: "日用品", qiyong: true }];
  e.setSettingsRaw(JSON.stringify(updated));
  e.plugin.commands.find((command) => command.id === "create-ledger").callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(Array.from(e.plugin.settingsSnapshot.shuju.fenlei, (item) => item.fenlei), ["日用品"]);
  assert.ok(e.roots.some((root) => root.node?.type?.name === "LedgerForm"));
  e.plugin.onunload();
});
test("invalid persisted configuration does not start business services or fallback index", async () => {
  const e = await environment({ settingsRaw: "bad" });
  assert.equal(e.plugin.stores, null); assert.equal(e.plugin.index, null); assert.equal(e.registered.length, 0);
  assert.ok(e.notices.some((message) => message.includes("设置读取失败")));
});
test("unload while configuration read is pending prevents late services and registrations", async () => {
  const e = await environment(); e.plugin.onunload(); const count = e.registered.length;
  let release; e.app.vault.getAbstractFileByPath = (path) => new e.TFile(path);
  e.app.vault.read = () => new Promise((resolve) => { release = resolve; });
  const loading = e.plugin.onload(); e.plugin.onunload(); release(configuredSettings); await loading;
  assert.equal(e.plugin.stores, null); assert.equal(e.plugin.settingsSnapshot, null); assert.equal(e.registered.length, count);
});

test("Vault event bindings forward file changes and folder moves, retired index stops on unload", async () => {
  const e = await environment(), calls = [], index = e.plugin.index;
  assert.deepEqual(e.registered.map((event) => event.name), ["active-leaf-change", "modify", "create", "modify", "delete", "rename"]);
  index.changed = async (...args) => { calls.push(["changed", ...args]); };
  index.removed = async (...args) => { calls.push(["removed", ...args]); };
  index.rebuild = async () => { calls.push(["rebuild"]); };
  e.events.get("create")(new e.TFile("a.md")); e.events.get("modify")(new e.TFile("a.md"));
  e.events.get("rename")(new e.TFile("b.md"), "a.md"); e.events.get("delete")(new e.TFile("b.md"));
  e.events.get("rename")({ path: "folder" }, "old-folder");
  assert.deepEqual(calls, [["changed", "a.md"], ["changed", "a.md"], ["changed", "b.md", "a.md"], ["removed", "b.md"], ["rebuild"]]);
  e.plugin.onunload(); assert.equal(e.plugin.index, null); assert.throws(() => index.all());
});

test("command, ribbon and settings entry open one reusable view", async () => {
  const e = await environment();
  const openCommand = e.plugin.commands.find((command) => command.id === "open-lifeos");
  assert.ok(openCommand);
  openCommand.callback();
  await e.plugin.openLifeOS();
  e.plugin.ribbons[0].callback();
  await e.plugin.openLifeOS();
  e.plugin.settingTab.display();
  e.settings[0].click();
  await e.plugin.openLifeOS();
  assert.equal(e.workspace.created, 1);
  assert.equal(e.workspace.revealed, 3);
  assert.equal(e.roots[0].renders, 1);
  const markup = renderToStaticMarkup(e.roots[0].node);
  assert.ok(markup.includes("进行中事项"));
  assert.ok(e.roots[0].node.props.home, "Real summary port is connected");
  assert.ok(markup.includes('aria-labelledby="lifeos-title-'));
  assert.ok(markup.includes('aria-label="LifeOS页面"'));
  const shortcuts = markup.match(/class="lifeos-shortcuts"[\s\S]*?<\/div>/)?.[0];
  assert.ok(shortcuts, "Quick entry actions are rendered");
  assert.equal((shortcuts.match(/disabled=""/g) ?? []).length, 0, "All quick entry actions are now connected");
  e.plugin.settingTab.hide();
  assert.equal(e.plugin.settingTab.containerEl.children.length, 0);
  e.plugin.onunload();
  assert.equal(e.roots[0].unmounts, 1);
});

test("concurrent open requests share a single pending creation", async () => {
  const e = await environment({ delayCreate: true });
  const first = e.plugin.openLifeOS();
  assert.equal(e.plugin.openLifeOS(), first);
  assert.equal(e.workspace.created, 1);
  e.resumeCreate(); await first;
  assert.equal(e.roots.length, 1);
  e.plugin.onunload();
});

test("closing and reopening creates a new root; unload cleans each exactly once", async () => {
  const e = await environment();
  await e.plugin.openLifeOS();
  e.workspace.leaves[0].detach();
  assert.equal(e.roots[0].unmounts, 1);
  await e.plugin.openLifeOS();
  assert.equal(e.roots.length, 2);
  e.plugin.onunload(); e.plugin.onunload();
  assert.deepEqual(e.roots.map((root) => root.unmounts), [1, 1]);
  assert.equal(e.workspace.leaves.length, 0);
  assert.equal(e.hostSibling.textContent, "User note content");
  assert.ok(e.roots.every((root) => root.element.parent === null));
});

test("unloading during creation prevents a late root or focus", async () => {
  const e = await environment({ delayCreate: true });
  const opening = e.plugin.openLifeOS();
  e.plugin.onunload(); e.resumeCreate(); await opening;
  assert.equal(e.roots.length, 0);
  assert.equal(e.workspace.leaves.length, 0);
  assert.equal(e.workspace.revealed, 0);
  await e.plugin.openLifeOS();
  assert.equal(e.workspace.created, 1);
});

test("failed host creation is cleaned and reports a notice through a UI request", async () => {
  const e = await environment({ failCreate: true });
  e.plugin.requestOpen();
  await assert.rejects(e.plugin.openLifeOS(), /host create failed/);
  assert.equal(e.workspace.leaves.length, 0);
  assert.equal(e.notices.length, 1);
  // A failure must release the single-flight slot for an explicit retry.
  await assert.rejects(e.plugin.openLifeOS(), /host create failed/);
  assert.equal(e.workspace.created, 2);
  e.plugin.onunload();
});

test("failed render unmounts its root and removes its owned DOM", async () => {
  const e = await environment({ failRender: true });
  await assert.rejects(e.plugin.openLifeOS(), /render failed/);
  assert.equal(e.roots[0].unmounts, 1);
  assert.equal(e.roots[0].element.parent, null);
  assert.equal(e.workspace.leaves.length, 0);
  e.plugin.onunload();
});
