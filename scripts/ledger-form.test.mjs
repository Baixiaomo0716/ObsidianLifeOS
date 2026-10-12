import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import * as esbuild from "esbuild";
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ["src/ui/LedgerForm.tsx"], bundle: true, format: "cjs", platform: "browser", external: ["react", "react/jsx-runtime"], write: false });
function fixture() {
  const states = []; let cursor = 0, prepares = 0, saves = 0, closed = 0, completed = 0; const requests = [];
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = initial; return [states[n], (v) => states[n] = v]; }, useRef(initial) { const n = cursor++; if (!(n in states)) states[n] = { current: initial }; return states[n]; } };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: (name) => name === "react" ? fake : require(name) });
  const props = { service: { today: () => "2026-10-10", categories: (kind) => kind === "shouru" ? ["工资"] : ["餐饮"], prepare: (input) => { prepares++; return input; }, execute: async (draft) => { saves++; requests.push(draft); if (saves === 1) throw Error("未确认"); return "id"; } }, active: () => true, close: () => closed++, saved: () => completed++ };
  const walk = (n) => !n || typeof n !== "object" ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  const nodes = () => { cursor = 0; return walk(module.exports.LedgerForm(props)); };
  return { nodes, stats: () => ({ prepares, saves, closed, completed, requests }) };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("cancel performs no writes; changing kind selects matching category", () => {
  const f = fixture(); f.nodes().find((n) => n.type === "select").props.onChange({ target: { value: "shouru" } });
  assert.equal(f.nodes().filter((n) => n.type === "select")[1].props.value, "工资"); f.nodes().find((n) => n.props.children === "取消").props.onClick(); assert.equal(f.stats().prepares, 0);
});
test("double click and retry lock original values and preserve one request", async () => {
  const f = fixture(), button = f.nodes().find((n) => n.props.children === "保存记账"); button.props.onClick(); button.props.onClick(); await flush();
  assert.equal(f.stats().prepares, 1); assert.equal(f.stats().saves, 1); assert.equal(f.nodes().find((n) => n.type === "input").props.disabled, true);
  f.nodes().find((n) => n.props.children === "重试保存").props.onClick(); await flush(); assert.equal(f.stats().requests[0], f.stats().requests[1]); assert.equal(f.stats().completed, 1);
});
