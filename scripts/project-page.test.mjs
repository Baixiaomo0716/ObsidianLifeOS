import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as esbuild from "esbuild";
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ["src/ui/ProjectPage.tsx"], bundle: true, format: "cjs", platform: "browser", external: ["react", "react/jsx-runtime"], write: false });
function fixture(ratio) {
  const states = []; let cursor = 0, opened, related, created = 0, queried;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = initial; return [states[n], (v) => states[n] = typeof v === "function" ? v(states[n]) : v]; }, useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: (name) => name === "react" ? fake : require(name) });
  const project = { path: "项目.md", version: { original: "raw" }, attributes: { biaoshi: "p", jindu: "jinxingzhong" }, body: "<script>私人正文</script>" }, task = { path: "待办.md", attributes: { biaoshi: "t", jindu: "weikaishi" } };
  const port = { active: () => true, create: () => created++, open: (id) => opened = id, relations: (id) => related = id, service: { subscribe: () => () => {}, list: (text, page) => { queried = { text, page }; return { ready: true, total: 1, issues: 0, page: 1, pages: 1, items: [project] }; }, detail: () => ({ project, tasks: [task], completed: 1, total: 2, ratio }) } };
  const render = () => { cursor = 0; return module.exports.ProjectPage({ port }); }, walk = (n) => !n || typeof n !== "object" ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  return { nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ opened, related, created, queried }) };
}
test("project selection renders derived ratio and raw text, task actions use existing IDs", () => {
  const f = fixture(.5); f.nodes().find((n) => n.props.children === "项目").props.onClick(); assert.ok(f.html().includes("50.0%")); assert.ok(f.html().includes("&lt;script&gt;"));
  f.nodes().find((n) => n.props.children === "打开原笔记").props.onClick(); f.nodes().find((n) => n.props.children === "编辑关联 / 移出项目").props.onClick(); assert.equal(f.stats().opened, "p"); assert.equal(f.stats().related, "t");
});
test("unknown ratio stays unknown and search/create route correctly", () => {
  const f = fixture(null); f.nodes().find((n) => n.props.children === "项目").props.onClick(); assert.ok(f.html().includes("未知（无有效待办）"));
  f.nodes().find((n) => n.type === "input").props.onChange({ target: { value: "项目" } }); f.nodes(); assert.equal(f.stats().queried.text, "项目"); f.nodes().find((n) => n.props.children === "新建项目").props.onClick(); assert.equal(f.stats().created, 1);
});
test("project page switches board and list without losing selected detail", () => {
  const f = fixture(.5); f.nodes().find(n => n.props.children === "项目").props.onClick();
  f.nodes().find(n => n.props.children === "看板").props.onClick();
  assert.ok(f.nodes().some(n => typeof n.type === "function" && n.type.name === "ProjectBoard"));
  f.nodes().find(n => n.props.children === "列表").props.onClick(); assert.ok(f.html().includes("50.0%"));
});
