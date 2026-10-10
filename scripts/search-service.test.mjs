import assert from "node:assert/strict";
import { test } from "node:test";
import * as esbuild from "esbuild";
const built = await esbuild.build({ entryPoints: ["src/services/search-service.ts"], bundle: true, format: "esm", platform: "browser", write: false });
const { SearchService } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const row = (id, type, extra = {}, body = "") => ({ path: `LifeOS/${id}.md`, body, attributes: { biaoshi: id, shiti: type, mingcheng: "旧标题", biaoqian: [], ...extra } });
function fixture(rows) { const index = { initialized: true, all: () => structuredClone(rows), issues: () => [], subscribe: () => () => {} }; return { index, service: new SearchService(index, "Asia/Shanghai") }; }
test("search uses current basename, body, tags and business prose; tags match exactly", () => {
  const f = fixture([row("新标题", "zhishi", { biaoqian: ["读书"], neirong: "片段" }, "正文")]);
  for (const text of ["新标题", "正文", "读书", "片段", "正文 片段"]) assert.equal(f.service.query({ type: "all", text }).total, 1);
  assert.equal(f.service.query({ type: "all", text: "旧标题" }).total, 0);
  assert.equal(f.service.query({ type: "all", tag: "#读书" }).total, 1);
  assert.equal(f.service.query({ type: "all", tag: "读" }).total, 0);
});
test("reading progress and module scope; meaningless progress ignored for diary", () => {
  const f = fixture([row("a", "yuedu", { zhuangtai: "jinxingzhong" }), row("b", "riji", { riqi: "2026-10-10" })]);
  assert.equal(f.service.query({ type: "all", progress: "jinxingzhong" }).total, 1);
  assert.equal(f.service.query({ type: "riji", progress: "jinxingzhong" }).total, 1);
  assert.equal(f.service.query({ type: "all", allowed: [] }).total, 0);
});
test("date fields are type scoped, timezone respected, missing dates excluded", () => {
  const f = fixture([row("a", "yuedu", { kaishishijian: "2026-10-09T18:00:00Z", duwanshijian: "2026-10-12T00:00:00Z" }), row("b", "zhishi")]);
  assert.equal(f.service.query({ type: "all", from: "2026-10-10", to: "2026-10-10" }).total, 1);
  assert.equal(f.service.query({ type: "yuedu", dateField: "duwanshijian", from: "2026-10-12" }).total, 1);
  assert.equal(f.service.query({ type: "yuedu", dateField: "jiezhiriqi", from: "2026-10-12" }).total, 0);
  assert.ok(f.service.query({ type: "all", from: "2026-02-30" }).error);
  assert.ok(f.service.query({ type: "all", from: "2026-10-12", to: "2026-10-10" }).error);
});
test("reverse relations resolve case insensitive IDs across ledger and notes; missing targets preserved", () => {
  const f = fixture([row("A", "jizhang", { riqi: "2026-10-10", fenlei: "餐饮", shouzhi: "zhichu", jine: 1250 }), row("b", "riji", { guanlian: ["A", "a", "missing"] })]);
  const r = f.service.relations("B"); assert.equal(r.outgoing.length, 2); assert.ok(r.outgoing[0].target.title.includes("¥12.50")); assert.equal(r.outgoing[1].target, undefined);
  assert.equal(f.service.relations("a").incoming[0].id, "b");
  assert.equal(f.service.relations("missing").incoming.length, 1);
});
test("bounded pagination clamps after deletion and does not mutate index values", () => {
  const rows = Array.from({ length: 101 }, (_, n) => row(String(n), "zhishi")); const f = fixture(rows);
  assert.equal(f.service.query({ type: "all" }).items.length, 50);
  assert.equal(f.service.query({ type: "all", page: 99 }).items.length, 1);
  rows.splice(1); assert.equal(f.service.query({ type: "all", page: 3 }).page, 1);
  const result = f.service.query({ type: "all" }); result.items[0].tags.push("侵入"); assert.equal(rows[0].attributes.biaoqian.length, 0);
  f.index.initialized = false; assert.equal(f.service.query({ type: "all" }).ready, false);
});
