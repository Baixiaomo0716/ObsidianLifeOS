import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import * as esbuild from "esbuild";
const built = await esbuild.build({ entryPoints: ["src/ui/project-flow-modal.ts"], bundle: true, format: "cjs", platform: "browser", external: ["obsidian"], write: false });
function fixture() {
  let modal, prepares = 0, calls = 0, closed = 0, received; const requests = [], notices = [];
  const element = () => ({ children: [], textContent: "", createDiv() { const child = element(); this.children.push(child); return child; }, createEl(tag, opts = {}) { const child = { ...element(), tag, value: opts.value ?? "", textContent: opts.text ?? "", disabled: false, addEventListener(_, fn) { this.handler = fn; } }; this.children.push(child); return child; } });
  class Modal { constructor() { modal = this; this.contentEl = element(); } open() {} close() { this.onClose(); } }
  const module = { exports: {} }; vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require: () => ({ Modal, Notice: class { constructor(text) { notices.push(text); } } }) });
  const service = { pendingTasks: () => [{ path: "待办.md", attributes: { biaoshi: "t" } }], prepare: async (_, action, choices) => { prepares++; received = { action, choices }; return { id: "flow" }; }, execute: async (draft, report) => { calls++; requests.push(draft); report("待办.md", "已处理"); if (calls === 1) throw Error("未确认"); } };
  const dispose = module.exports.openProjectFlow({}, service, { attributes: { biaoshi: "p" } }, () => true, () => closed++);
  const walk = (n) => [n, ...n.children.flatMap(walk)];
  return { modal, dispose, nodes: () => walk(modal.contentEl), stats: () => ({ prepares, calls, closed, received, requests, notices }) };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("closing without submitting creates no plan and releases once", () => {
  const f = fixture(); f.dispose(); f.dispose(); f.nodes().find((n) => n.tag === "button").handler(); assert.equal(f.stats().prepares, 0); assert.equal(f.stats().closed, 1);
});
test("per-task choice, rapid submission and recovery reuse one captured flow", async () => {
  const f = fixture(), selects = f.nodes().filter((n) => n.tag === "select"); selects[1].value = "yichu";
  const button = f.nodes().find((n) => n.tag === "button"); button.handler(); button.handler(); await flush();
  assert.equal(f.stats().prepares, 1); assert.equal(f.stats().received.choices.t, "yichu"); assert.equal(selects[1].disabled, true);
  button.handler(); f.dispose(); await flush(); assert.equal(f.stats().requests[0], f.stats().requests[1]); assert.equal(f.stats().notices.length, 1);
});
