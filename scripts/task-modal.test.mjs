import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import * as esbuild from "esbuild";
const built = await esbuild.build({ entryPoints: ["src/ui/task-modal.ts"], bundle: true, format: "cjs", platform: "browser", external: ["obsidian"], write: false });
function fixture(fail = false) {
  let modal, calls = 0, prepared = 0, active = true, closed = 0; const notices = [], requests = [];
  const element = () => ({ children: [], createEl(tag, opts = {}) { const child = { ...element(), tag, value: opts.value ?? "", textContent: opts.text, disabled: false, addEventListener(_, fn) { this.click = fn; } }; this.children.push(child); return child; } });
  class Modal { constructor() { modal = this; this.contentEl = element(); } open() {} close() { this.onClose(); } }
  const module = { exports: {} }; vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require: () => ({ Modal, Notice: class { constructor(text) { notices.push(text); } } }) });
  const service = { prepare: async (_, action) => { prepared++; return { action }; }, execute: async (draft) => { calls++; requests.push(draft); if (fail && calls === 1) throw Error("未确认"); } };
  const close = module.exports.openTaskModal({}, service, { attributes: { jindu: "weikaishi", yiquxiao: false } }, () => active, () => closed++);
  return { modal, close, stop: () => active = false, stats: () => ({ prepared, calls, requests, notices, closed }), button: modal.contentEl.children.find((v) => v.tag === "button") };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("cancel before submit performs no preparation; repeated cleanup is idempotent", () => {
  const f = fixture(); f.close(); f.close(); f.button.click(); assert.equal(f.stats().calls, 0); assert.equal(f.stats().prepared, 0); assert.equal(f.stats().closed, 1);
});
test("double click and retry preserve request, closed completion reports once and stopped stays quiet", async () => {
  const f = fixture(true); f.button.click(); f.button.click(); await flush(); assert.equal(f.stats().prepared, 1); assert.equal(f.stats().calls, 1);
  f.button.click(); f.close(); await flush(); assert.equal(f.stats().requests[0], f.stats().requests[1]); assert.equal(f.stats().notices.length, 1);
  const g = fixture(); g.button.click(); g.stop(); await flush(); assert.equal(g.stats().notices.length, 0);
});
