import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import * as esbuild from "esbuild";
const built = await esbuild.build({ entryPoints: ["src/ui/attachment-import-modal.ts"], bundle: true, format: "cjs", platform: "browser", write: false, external: ["obsidian"] });
function fixture() {
  class Element { constructor(tag, props = {}) { this.tag = tag; this.textContent = props.text ?? ""; this.children = []; this.events = {}; this.disabled = false; } createEl(tag, props) { const child = new Element(tag, props); this.children.push(child); return child; } createDiv() { return this.createEl("div"); } addEventListener(name, fn) { this.events[name] = fn; } }
  let modal, closed = 0, ownerActive = true, prepares = 0, copies = 0, associations = 0; const notices = [], attempted = [];
  class Modal { constructor() { modal = this; this.contentEl = new Element("div"); } open() {} close() { this.onClose(); } }
  const module = { exports: {} }; vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require: () => ({ Modal, Notice: class { constructor(message) { notices.push(message); } } }) });
  const store = { prepare: async (file) => { prepares++; return { info: { 路径: `附件/${file.name}` } }; }, execute: async (draft) => { copies++; if (draft.info.路径.includes("bad") && copies === 1) throw Error("copy failed"); return draft.info; } };
  const index = { rebuild: async () => {}, find: () => ({ path: "LifeOS/82_项目/测试项目/测试项目.md", attributes: { shangchuanwenjian: [] } }) };
  const references = { prepare: async (_, paths) => ({ paths }), execute: async (draft) => { associations++; attempted.push(draft); } };
  const dispose = module.exports.openAttachmentImportModal({}, "project", index, store, references, 1024, () => ownerActive, () => closed++);
  const walk = (node) => [node, ...node.children.flatMap(walk)], nodes = () => walk(modal.contentEl);
  const choose = (names) => { const input = nodes().find((n) => n.tag === "input"); input.files = names.map((name) => ({ name, size: 3, type: "application/pdf" })); input.events.change(); };
  return { choose, nodes, dispose, store, references, stop: () => { ownerActive = false; }, stats: () => ({ prepares, copies, associations, attempted, closed, notices }) };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("multi-file import isolates failed row, continues later rows, and retries only failed item", async () => {
  const f = fixture(); f.choose(["bad.pdf", "good.pdf"]); f.nodes().find((n) => n.textContent === "导入全部待处理文件").events.click(); await flush();
  assert.equal(f.stats().copies, 2); assert.equal(f.stats().associations, 1); assert.ok(f.nodes().some((n) => n.textContent.includes("copy failed")));
  f.nodes().find((n) => n.textContent === "重试此文件").events.click(); await flush(); assert.equal(f.stats().prepares, 2); assert.equal(f.stats().copies, 3); assert.equal(f.stats().associations, 2);
  f.nodes().find((n) => n.textContent === "导入全部待处理文件").events.click(); await flush(); assert.equal(f.stats().copies, 3);
});
test("uncertain association retries same request without recopying file or duplicating preparation", async () => {
  const f = fixture(), requests = []; let first = true;
  f.references.execute = async (draft) => { requests.push(draft); if (first) { first = false; throw Error("uncertain association"); } };
  f.choose(["good.pdf"]); const button = f.nodes().find((n) => n.textContent === "导入此文件"); button.events.click(); button.events.click(); await flush();
  assert.equal(f.stats().copies, 1); assert.ok(f.nodes().some((n) => n.textContent.includes("文件已保存"))); button.events.click(); await flush(); assert.equal(f.stats().copies, 1); assert.equal(requests[0], requests[1]);
});
test("closing before queued work starts writes nothing and cleanup is idempotent", async () => {
  const f = fixture(); f.choose(["good.pdf"]); f.nodes().find((n) => n.textContent === "导入此文件").events.click(); f.dispose(); f.dispose(); await flush();
  assert.equal(f.stats().copies, 0); assert.equal(f.stats().closed, 1); assert.equal(f.stats().notices.length, 0);
});
