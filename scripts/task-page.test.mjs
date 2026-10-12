import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import * as esbuild from "esbuild";
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ["src/ui/TaskPage.tsx"], bundle: true, platform: "browser", format: "cjs", write: false, external: ["react", "react/jsx-runtime"] });
function fixture() {
  const states = { parent: [], editor: [] }; let cursor = 0, scope = "parent", prepares = 0, saves = 0, create = 0, relation, progress, opened;
  const requests = [], queries = [];
  const fake = { ...React, useState(initial) { const n = cursor++, state = states[scope]; if (!(n in state)) state[n] = initial; return [state[n], (v) => state[n] = typeof v === "function" ? v(state[n]) : v]; }, useRef(initial) { const n = cursor++, state = states[scope]; if (!(n in state)) state[n] = { current: initial }; return state[n]; }, useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: (name) => name === "react" ? fake : require(name) });
  const row = { id: "task", title: "整理", group: "shoujixiang", source: { attributes: { jindu: "weikaishi", kaishiriqi: "2026-10-10", jiezhiriqi: "2026-10-11" } } };
  const port = { list: { subscribe: () => () => {}, query: (...query) => { queries.push(query); return { ready: true, total: 1, today: "2026-10-10", issues: 0, page: 1, pages: 1, items: [row] }; } }, service: { prepareDates: async (_, start, end) => { prepares++; return { start, end }; }, execute: async (draft) => { saves++; requests.push(draft); if (saves === 1) throw Error("未确认"); } }, create: () => create++, relations: (id) => relation = id, progress: (id) => progress = id, open: (id) => opened = id };
  const walk = (n) => !n || typeof n !== "object" ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  const render = () => { scope = "parent"; cursor = 0; return module.exports.TaskPage({ port }); };
  const nodes = () => walk(render());
  const editor = () => { const n = nodes().find((n) => typeof n.type === "function"); scope = "editor"; cursor = 0; return walk(n.type(n.props)); };
  return { nodes, editor, stats: () => ({ prepares, saves, requests, queries, create, relation, progress, opened }) };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("task tabs, search, create, open, progress and relation route to real services", () => {
  const f = fixture(), click = (text) => f.nodes().find((n) => n.type === "button" && n.props.children === text).props.onClick();
  click("今天"); f.nodes(); assert.equal(f.stats().queries.at(-1)[0], "jintian");
  f.nodes().find((n) => n.type === "input").props.onChange({ target: { value: "整理" } }); f.nodes(); assert.equal(f.stats().queries.at(-1)[1], "整理");
  click("新建待办"); click("整理"); click("修改进度"); click("关联 / 项目归属");
  assert.equal(f.stats().create, 1); assert.equal(f.stats().opened, "task"); assert.equal(f.stats().progress, "task"); assert.equal(f.stats().relation, "task");
});
test("date cancel does not prepare and uncertain retry locks values and reuses captured request", async () => {
  const f = fixture(); f.nodes().find((n) => n.props.children === "编辑日期").props.onClick();
  f.editor().find((n) => n.props.children === "取消编辑").props.onClick(); assert.equal(f.stats().prepares, 0);
  f.nodes().find((n) => n.props.children === "编辑日期").props.onClick(); const button = f.editor().find((n) => n.props.children === "保存日期");
  button.props.onClick(); button.props.onClick(); await flush(); assert.equal(f.stats().prepares, 1); assert.equal(f.stats().saves, 1);
  assert.equal(f.editor().find((n) => n.type === "input").props.disabled, true);
  f.editor().find((n) => n.props.children === "重试日期保存").props.onClick(); await flush();
  assert.equal(f.stats().requests[0], f.stats().requests[1]);
});
