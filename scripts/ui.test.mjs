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
  h.click("首页"); const homeHtml = h.html(); assert.ok(homeHtml.includes("启用知识模块后即可记录灵感")); assert.equal((homeHtml.match(/data-type="jizhang"/g) ?? []).length, 1);
});
test("all modules disabled show real empty preference state", () => {
  const h = harness({ enabledModules: [] }); h.click("记录"); assert.ok(h.html().includes("暂无启用模块"));
});
test("review switches tags and records preserving selected module and enabled scope", () => {
  const h = harness({ enabledModules: ["zhishi", "yuedu"] }); h.click("回看");
  h.walk(h.render()).find(n => n.type === "select").props.onChange({ target: { value: "zhishi" } });
  h.walk(h.render()).find(n => n.props.children === "标签浏览").props.onClick();
  const tags = h.walk(h.render()).find(n => typeof n.type === "function" && n.type.name === "TagPage"); assert.equal(tags.props.type, "zhishi"); assert.equal(tags.props.allowed.join(","), "zhishi,yuedu");
  h.walk(h.render()).find(n => n.props.children === "记录浏览").props.onClick(); assert.ok(h.html().includes("知识记录"));
});
test("record and quick-note buttons call the real creation port, ledger stays disabled", () => {
  const called = [], h = harness({ onCreateNote: (type) => called.push(type) });
  const buttons = h.walk(h.render()).filter((node) => node.type === "button");
  const diary = buttons.find((node) => React.Children.toArray(node.props.children)[0] === "日记"); diary.props.onClick(); assert.equal(called[0], "riji");
  h.click("记录"); const recordButtons = h.walk(h.render()).filter((node) => node.type === "button" && node.props.children === "新建笔记");
  assert.equal(recordButtons.length, 9); recordButtons[0].props.onClick(); assert.equal(called[1], "riji");
  assert.equal(h.walk(h.render()).filter((node) => node.type === "button" && node.props.disabled).length, 1);
});

test("review switches to period page and preserves record module", () => {
  const h = harness({ enabledModules: ["zhishi"] }); h.click("回看");
  h.walk(h.render()).find(n => n.type === "select").props.onChange({ target: { value: "zhishi" } });
  h.walk(h.render()).find(n => n.props.children === "月年度回顾").props.onClick();
  assert.ok(h.walk(h.render()).some(n => typeof n.type === "function" && n.type.name === "PeriodReviewPage"));
  assert.equal(h.walk(h.render()).find(n => n.type === "select").props.disabled, true);
  h.walk(h.render()).find(n => n.props.children === "记录浏览").props.onClick(); assert.ok(h.html().includes("知识记录"));
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

test("home renders body TODO text and source note separately from today's note count", () => {
  const data = { ready: true, today: "2026-10-12", issues: 0, tasks: [], recent: [], ongoing: [], bodyTodos: [
    { id: "task-note", type: "daiban", title: "准备周报", updated: "2026-10-12T00:00:00Z", text: "整理本周资料", line: 3 },
    { id: "task-note", type: "daiban", title: "准备周报", updated: "2026-10-12T00:00:00Z", text: "检查交付结果", line: 4 }
  ] };
  const h = harness({ home: { service: { subscribe: () => () => {}, read: () => data }, open() {} } });
  const html = h.html();
  for (const text of ["今日待办 · 0", "待办清单 · 2", "整理本周资料", "检查交付结果", "准备周报"]) assert.ok(html.includes(text));
});
test("home shows real expense, consistent ongoing count including knowledge and scroll regions", () => {
  const data = { ready: true, today: "2026-10-12", issues: 0, expense: 1250, tasks: [], recent: [], ongoing: [{ id: "book", type: "yuedu", title: "真实阅读", updated: "2026-10-12T00:00:00Z" }, { id: "knowledge", type: "zhishi", title: "真实知识", updated: "2026-10-12T00:00:00Z" }] };
  const h = harness({ home: { service: { subscribe: () => () => {}, read: () => data }, open() {} } }), html = h.html(); assert.ok(html.includes("¥12.50")); assert.ok(html.includes("进行中共 2 项；当前显示 2 项")); assert.ok(html.includes("真实知识")); assert.equal((html.match(/lifeos-card-body/g) ?? []).length, 5);
});
test("home never converts unavailable or overflowing data to a zero expense", () => {
  const data = { ready: false, today: "2026-10-12", issues: 0, tasks: [], recent: [], ongoing: [] }, h = harness({ home: { service: { subscribe: () => () => {}, read: () => data }, open() {} } }); assert.ok(h.html().includes("正在读取真实记录")); assert.ok(!h.html().includes("今日支出")); data.ready = true; data.moneyError = "累计金额超出安全范围"; assert.ok(h.html().includes("今日支出无法汇总")); assert.ok(!h.html().includes("¥0.00"));
});

test("home follows the four-panel reference and retains local readable timestamps", () => {
  const data = { ready: true, today: "2026-10-12", zone: "Asia/Shanghai", issues: 0, journalEnabled: true, todayJournal: { id: "diary", type: "riji", title: "日记", updated: "2026-10-12T00:30:00Z" }, week: { start: "2026-10-12", journals: 1, tasks: 2, books: 0, expense: 850 }, tasks: [], ongoing: [], recent: [{ id: "diary", type: "riji", title: "日记", updated: "2026-10-12T00:30:00Z" }] };
  const h = harness({ home: { service: { subscribe: () => () => {}, read: () => data }, open() {} } });
  const html = h.html();
  assert.ok(!html.includes("本周概览"));
  assert.ok(!html.includes("今日日记已记录"));
  assert.ok(html.includes("今天 08:30")); assert.ok(!html.includes("lifeos-home-empty"));
  data.todayJournal = undefined; assert.ok(!h.html().includes("今天还未写日记"));
});
test("home lifetime renders real totals and distinguishes disabled modules", () => {
  const data = { ready: true, today: "2026-10-12", issues: 0, tasks: [], ongoing: [], recent: [], lifetime: { days: 128, notes: 356, projects: 12, tasks: 86, books: undefined, knowledge: 64, streak: 7, newThisWeek: 9, firstDate: "2026-02-18" } };
  const html = harness({ home: { service: { subscribe: () => () => {}, read: () => data }, open() {} } }).html();
  for (const text of ["生活累计", "128", "356", "连续记录 7 天", "本周小结：新增 9 篇", "未启用"]) assert.ok(html.includes(text));
  assert.equal((html.match(/lifeos-lifetime-metrics/g) ?? []).length, 1);
});
