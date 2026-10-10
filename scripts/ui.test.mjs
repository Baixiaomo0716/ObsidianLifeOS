import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as esbuild from "esbuild";
const require = createRequire(import.meta.url);
const built = await esbuild.build({ entryPoints: ["src/ui/App.tsx"], bundle: true, format: "cjs", platform: "browser", write: false, external: ["react", "react/jsx-runtime"], logLevel: "silent" });
function harness(props = {}) {
  const state = []; let cursor = 0, nextId = 0;
  const fakeReact = { ...React, useState(initial) { const index = cursor++; if (state[index] === undefined) state[index] = initial; return [state[index], (value) => { state[index] = value; }]; }, useId() { return `test-${nextId++}`; }, useRef() { return { current: null }; }, useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require(name) { return name === "react" ? fakeReact : require(name); } });
  const render = () => { cursor = 0; return module.exports.App(props); };
  const walk = (node) => { if (!node || typeof node !== "object") return []; return [node, ...React.Children.toArray(node.props?.children).flatMap(walk)]; };
  const click = (name) => {
    const button = walk(render()).find((node) => node.type === "button" && React.Children.toArray(node.props.children).some((child) => child?.props?.children === name));
    assert.ok(button, `Missing navigation ${name}`); button.props.onClick();
  };
  return { render, click, walk, html: () => renderToStaticMarkup(render()) };
}
test("four navigation actions select actual panels and active page indicator", () => {
  const h = harness(); assert.ok(h.html().includes("进行中事项"));
  for (const [name, text] of [["记录", "选择记录类型"], ["回看", "全部记录"], ["设置", "使用偏好"], ["首页", "进行中事项"]]) {
    h.click(name); const tree = h.render(); assert.ok(renderToStaticMarkup(tree).includes(text));
    const active = h.walk(tree).filter((node) => node.type === "button" && node.props["aria-current"] === "page"); assert.equal(active.length, 1);
  }
});
test("disabled modules hidden from record choices without a fake clickable creation action", () => {
  const h = harness({ enabledModules: ["jizhang"] }); h.click("记录"); const html = h.html();
  assert.equal((html.match(/lifeos-module-row/g) ?? []).length, 1); assert.ok(html.includes("收入与支出"));
  h.click("首页"); assert.equal((h.html().match(/disabled=""/g) ?? []).length, 1);
});
test("all modules disabled show real empty preference state", () => {
  const h = harness({ enabledModules: [] }); h.click("记录"); assert.ok(h.html().includes("暂无启用模块"));
});
test("record and quick-note buttons call the real creation port, ledger stays disabled", () => {
  const called = [], h = harness({ onCreateNote: (type) => called.push(type) });
  const buttons = h.walk(h.render()).filter((node) => node.type === "button");
  const diary = buttons.find((node) => React.Children.toArray(node.props.children)[0] === "日记"); diary.props.onClick(); assert.equal(called[0], "riji");
  h.click("记录"); const recordButtons = h.walk(h.render()).filter((node) => node.type === "button" && node.props.children === "新建笔记");
  assert.equal(recordButtons.length, 9); recordButtons[0].props.onClick(); assert.equal(called[1], "riji");
  assert.equal(h.walk(h.render()).filter((node) => node.type === "button" && node.props.disabled).length, 1);
});
test("review selection changes heading and survives navigating away and back", () => {
  const h = harness(); h.click("回看"); const select = h.walk(h.render()).find((node) => node.type === "select");
  select.props.onChange({ target: { value: "yuedu" } }); assert.ok(h.html().includes("阅读记录"));
  h.click("首页"); h.click("回看"); assert.ok(h.html().includes("阅读记录"));
});
test("heading and card references unique across rendered instances; preview has no fabricated totals", () => {
  const h = harness(), html = h.html() + h.html(); const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length); assert.ok(!html.includes("今日支出：0")); assert.ok(html.includes("同步状态请在同步工具中查看"));
});

test("review renders real query results with opening actions and pagination rather than sample rows", () => {
  const service = { subscribe: () => () => {}, query: () => ({ ready: true, issues: 0, total: 1, page: 1, pages: 1, items: [{ id: "id", type: "zhishi", title: "真实标题", tags: ["笔记"], date: "", path: "a.md", references: [] }] }) };
  const h = harness({ review: { service, open() {} } }); h.click("回看");
  const html = h.html(); assert.ok(html.includes("真实标题")); assert.ok(html.includes("共 1 条记录")); assert.ok(html.includes("查看关联")); assert.ok(html.includes("上一页")); assert.ok(!html.includes("列表查询待接入"));
});
