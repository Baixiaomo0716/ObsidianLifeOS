import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as esbuild from "esbuild";
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ["src/ui/LedgerPage.tsx"], bundle: true, platform: "browser", format: "cjs", external: ["react", "react/jsx-runtime"], write: false });
test("table filters, pagination and export routes preserve selection; editing uses captured row", async () => {
  const states = []; let cursor = 0, query, exported, download, edited;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = initial; return [states[n], (v) => states[n] = typeof v === "function" ? v(states[n]) : v]; }, useRef(initial) { const n = cursor++; if (!(n in states)) states[n] = { current: initial }; return states[n]; }, useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: (name) => name === "react" ? fake : require(name) });
  const row = { version: { original: "raw" }, attributes: { biaoshi: "id", riqi: "2026-10-10", xingqi: "星期六", shouzhi: "zhichu", fenlei: "历史分类", jine: 1250, biaoqian: [] } };
  const port = { active: () => true, create() {}, download: (...args) => download = args, entry: { today: () => "2026-10-10", categories: () => ["餐饮"] }, table: { subscribe: () => () => {}, query: (value) => { query = value; return { ready: true, total: 51, page: value.page ?? 1, pages: 2, issues: 0, items: [row], totals: { shouru: 0, zhichu: 1250, jieyu: -1250 } }; }, export: (value, format) => { exported = { value, format }; return "all rows"; }, prepareEdit: async (source) => { edited = source; return { id: "id" }; } } };
  const walk = (n) => !n || typeof n !== "object" ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  const nodes = () => { cursor = 0; return walk(module.exports.LedgerPage({ port })); };
  nodes().find((n) => n.type === "input" && n.props.type === "date").props.onChange({ target: { value: "2026-10-01" } });
  nodes().find((n) => n.props.children === "下一页").props.onClick(); nodes().find((n) => n.props.children === "导出CSV").props.onClick();
  assert.equal(exported.value.from, "2026-10-01"); assert.equal(exported.value.page, 2); assert.deepEqual(download, ["csv", "all rows"]);
  nodes().find((n) => n.props.children === "编辑").props.onClick(); const form = nodes().find((n) => n.props.initial);
  assert.equal(form.props.initial.category, "历史分类"); await form.props.service.prepare({}); assert.equal(edited, row);
  assert.equal(query.page, 2);
});
test("table renders fixed monetary units and recycled rows only provide restore", async () => {
  const regular = await import("react"); const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require });
  const port = { active: () => true, create() {}, table: { subscribe: () => () => {}, query: () => ({ ready: true, total: 1, page: 1, pages: 1, issues: 0, totals: { shouru: 0, zhichu: 0, jieyu: 0 }, items: [{ version: { original: "raw" }, attributes: { biaoshi: "id", riqi: "2026-10-10", xingqi: "星期六", shouzhi: "zhichu", fenlei: "餐饮", jine: 1250, biaoqian: [], yihuishou: true } }] }) } };
  const html = renderToStaticMarkup(regular.createElement(module.exports.LedgerPage, { port })); assert.ok(html.includes("¥12.50")); assert.ok(html.includes("恢复")); assert.equal(html.includes(">编辑</button>"), false);
});
