import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as esbuild from "esbuild";
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ["src/ui/JournalForm.tsx"], bundle: true, platform: "browser", format: "cjs", write: false, external: ["react", "react/jsx-runtime"] });
function fixture({ blocked = false, failOpen = false } = {}) {
  const states = []; let cursor = 0, prepares = 0, writes = 0, opens = 0;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = typeof initial === "function" ? initial() : initial; return [states[n], (value) => { states[n] = typeof value === "function" ? value(states[n]) : value; }]; }, useRef(initial) { const n = cursor++; if (!(n in states)) states[n] = { current: initial }; return states[n]; }, useEffect() {}, useId() { return "journal"; } };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, Date, require: (name) => name === "react" ? fake : require(name) });
  const service = { ready: true, issueCount: blocked ? 1 : 0, today: () => "2026-10-10", subscribe: () => () => {}, day: (date) => ({ date, weekday: "星期六", status: blocked ? "blocked" : "empty", paths: blocked ? ["原日记.md", "重复日记.md"] : [], weather: "", tags: [], lunar: "", body: "", messages: blocked ? ["重复日记"] : [] }), month(month) { return Array.from({ length: 31 }, (_, n) => `${month}-${String(n + 1).padStart(2, "0")}`).filter((date) => { const d = new Date(`${date}T12:00:00Z`); return d.toISOString().slice(0, 10) === date; }).map((date) => this.day(date)); }, prepare: async (date) => { prepares++; return { date }; }, execute: async (draft) => { writes++; return `${draft.date}.md`; } };
  const port = { service, openPath: async () => { opens++; if (failOpen && opens === 1) throw Error("打开失败"); } };
  const render = () => { cursor = 0; return module.exports.JournalForm({ port }); };
  const walk = (node) => !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
  return { render, nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ prepares, writes, opens }) };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("calendar supports real month navigation, date selection and returning to timezone today", () => {
  const f = fixture(); assert.equal(f.nodes().filter((n) => n.type === "button" && n.props["aria-pressed"] !== undefined).length, 31);
  f.nodes().find((n) => n.props.children === "上个月").props.onClick(); assert.ok(f.html().includes("2026-09-01"));
  assert.equal(f.nodes().filter((n) => n.type === "button" && n.props["aria-pressed"] !== undefined).length, 30);
  f.nodes().find((n) => n.type === "input" && n.props.type === "date").props.onChange({ target: { value: "2024-02-29" } }); assert.ok(f.html().includes("2024-02-29"));
  f.nodes().find((n) => n.props.children === "今天").props.onClick(); assert.ok(f.html().includes("2026-10-10")); assert.equal(f.stats().writes, 0);
});
test("rapid repeated open and native open failure retry do not create a second note", async () => {
  const f = fixture({ failOpen: true }), button = f.nodes().find((n) => n.props.children === "创建并打开日记"); button.props.onClick(); button.props.onClick(); await flush();
  assert.equal(f.stats().writes, 1); assert.ok(f.html().includes("打开失败"));
  f.nodes().find((n) => n.props.children === "重试打开日记").props.onClick(); await flush(); assert.deepEqual(f.stats(), { prepares: 1, writes: 1, opens: 2 });
});
test("duplicate dates show original-file inspection and disable creation", () => {
  const f = fixture({ blocked: true }); assert.ok(f.html().includes("该日需要核对")); assert.ok(f.html().includes("原日记.md")); assert.ok(f.html().includes("重复日记.md"));
  assert.equal(f.nodes().some((n) => n.props.children === "创建并打开日记"), false); assert.equal(f.stats().writes, 0);
});
