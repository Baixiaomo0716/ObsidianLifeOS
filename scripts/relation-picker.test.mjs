import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as esbuild from "esbuild";
const require = createRequire(import.meta.url), built = await esbuild.build({ entryPoints: ["src/ui/RelationPicker.tsx"], bundle: true, format: "cjs", platform: "browser", write: false, external: ["react", "react/jsx-runtime"] });
function harness({ refs = [], fail = false } = {}) {
  const state = []; let cursor = 0, saves = 0, prepares = 0, closed = 0, cancelled = 0;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in state)) state[n] = initial; return [state[n], (value) => { state[n] = typeof value === "function" ? value(state[n]) : value; }]; }, useRef(initial) { const n = cursor++; if (!(n in state)) state[n] = { current: initial }; return state[n]; }, useEffect() {}, useId() { return "picker"; } };
  const module = { exports: {} }; vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require: (name) => name === "react" ? fake : require(name) });
  const rows = [{ id: "self", title: "自身", type: "riji" }, { id: "a", title: "日记目标", type: "riji" }, { id: "b", title: "记账目标", type: "jizhang" }], requests = [];
  const search = { subscribe: () => () => {}, query: ({ type, text }) => ({ ready: true, page: 1, pages: 1, items: rows.filter((item) => item.type === type && item.title.includes(text)) }), relations: (id) => ({ target: rows.find((item) => item.id === id) }) };
  const service = { prepare: async (_, selected) => { prepares++; return { selected: [...selected] }; }, execute: async (draft) => { saves++; requests.push(draft); if (fail && saves === 1) throw Error("未确认回执"); } };
  const props = { source: { attributes: { biaoshi: "self", guanlian: refs } }, search, service, allowed: ["riji", "jizhang"], close: () => cancelled++, active: () => true, saved: () => closed++ };
  const render = () => { cursor = 0; return module.exports.RelationPicker(props); };
  const walk = (node) => !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
  return { render, nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ saves, prepares, closed, cancelled, requests }) };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("type changes keep cross-type checked selections and self never appears", async () => {
  const h = harness(); assert.equal(h.nodes().filter((n) => n.type === "input" && n.props.type === "checkbox").length, 1);
  h.nodes().find((n) => n.type === "input" && n.props.type === "checkbox").props.onChange();
  h.nodes().find((n) => n.type === "select").props.onChange({ target: { value: "jizhang" } });
  h.nodes().find((n) => n.type === "input" && n.props.type === "checkbox").props.onChange();
  assert.ok(h.html().includes("已选择 2 条")); assert.ok(h.html().includes("日记目标")); assert.ok(h.html().includes("记账目标"));
  h.nodes().find((n) => n.type === "button" && n.props.children === "保存关联").props.onClick(); await flush();
  assert.deepEqual(h.stats().requests[0].selected, ["a", "b"]);
});
test("existing unavailable selection is visible, removable, and cancel does not save", () => {
  const h = harness({ refs: ["missing"] }); assert.ok(h.html().includes("目标暂不可用"));
  h.nodes().find((n) => n.type === "button" && n.props.children === "移除").props.onClick(); assert.ok(h.html().includes("已选择 0 条"));
  h.nodes().find((n) => n.type === "button" && n.props.children === "取消").props.onClick(); assert.equal(h.stats().saves, 0); assert.equal(h.stats().cancelled, 1);
});
test("rapid double submission and retry preserve one prepared request and lock selection", async () => {
  const h = harness({ fail: true }), button = h.nodes().find((n) => n.type === "button" && n.props.children === "保存关联");
  button.props.onClick(); button.props.onClick(); await flush(); assert.equal(h.stats().prepares, 1); assert.equal(h.stats().saves, 1);
  assert.equal(h.nodes().find((n) => n.type === "select").props.disabled, true);
  assert.ok(h.html().includes("未确认回执")); h.nodes().find((n) => n.type === "button" && n.props.children === "重试保存").props.onClick(); await flush();
  assert.equal(h.stats().prepares, 1); assert.equal(h.stats().requests[0], h.stats().requests[1]); assert.equal(h.stats().closed, 1);
});

test("modal close unmounts once; late save reports completion without reopening and unload stays quiet", async () => {
  const compiled = await esbuild.build({ entryPoints: ["src/ui/relation-modal.ts"], bundle: true, format: "cjs", platform: "browser", write: false, external: ["obsidian", "react", "react/jsx-runtime", "react-dom/client"] });
  let modal, props, unmounts = 0, closed = 0, ownerActive = true; const notices = [];
  class Modal { constructor() { modal = this; this.contentEl = {}; } open() { this.opens = (this.opens ?? 0) + 1; } close() { this.onClose(); } }
  const module = { exports: {} }; vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require(name) {
    if (name === "obsidian") return { Modal, Notice: class { constructor(message) { notices.push(message); } } };
    if (name === "react-dom/client") return { createRoot: () => ({ render: (node) => { props = node.props; }, unmount: () => unmounts++ }) };
    return require(name);
  } });
  const dispose = module.exports.openRelationModal({}, { active: () => ownerActive }, () => closed++);
  dispose(); dispose(); assert.equal(unmounts, 1); assert.equal(closed, 1); assert.equal(props.active(), false);
  props.saved(); assert.equal(modal.opens, 1); assert.equal(notices.length, 1);
  props.failed("错误"); assert.equal(notices.length, 2); ownerActive = false; props.saved(); props.failed("错误"); assert.equal(notices.length, 2);
});
