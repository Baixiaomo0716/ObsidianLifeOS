import assert from "node:assert/strict";
import { test } from "node:test";
import * as esbuild from "esbuild";
const b = await esbuild.build({ entryPoints: ["src/ui/layout-check.ts"], bundle: true, format: "esm", platform: "browser", write: false });
const x = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString("base64")}`);
function fixture({ width = 320, rootOverflow = 0, regionY = "auto", regionX = "auto", navHeight = 48, contentWidth = 300 } = {}) {
  const region = { clientWidth: 300, clientHeight: 240, scrollWidth: contentWidth, scrollHeight: 10000, className: "list", getAttribute: () => "100条长列表" }, nav = { textContent: "首页", getBoundingClientRect: () => ({ height: navHeight }) };
  return { ownerDocument: { defaultView: { getComputedStyle: () => ({ overflowY: regionY, overflowX: regionX }) } }, clientWidth: width, scrollWidth: width + rootOverflow, getBoundingClientRect: () => ({ width, height: 480 }), querySelector: () => ({ clientWidth: width, scrollWidth: width }), querySelectorAll: selector => selector.includes("navigation") ? [nav] : [region] };
}
test("long list and horizontally scrollable table remain reachable without false overflow failure", () => {
  const result = x.inspectLayout(fixture({ contentWidth: 900 })); assert.equal(result.problems.length, 0); assert.equal(result.regions[0].contentHeight, 10000); assert.ok(x.layoutReport(result).includes("桌面检查不代表手机验收"));
});
test("clipped list, horizontal frame overflow and small narrow navigation report concrete failures", () => {
  const result = x.inspectLayout(fixture({ rootOverflow: 15, regionY: "hidden", regionX: "hidden", contentWidth: 900, navHeight: 30 })); assert.equal(result.problems.length, 4); assert.ok(result.problems.some(p => p.includes("纵向滚动"))); assert.ok(result.problems.some(p => p.includes("48px")));
});
test("invisible or detached host cannot be reported as passing; sub-baseline widths need review", () => {
  const root = fixture({ width: 0 }); assert.throws(() => x.inspectLayout(root), /不可见/); root.ownerDocument.defaultView = null; assert.throws(() => x.inspectLayout(root), /不可用/); assert.ok(x.inspectLayout(fixture({ width: 280 })).problems.some(p => p.includes("320px")));
});