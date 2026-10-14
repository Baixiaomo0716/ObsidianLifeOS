import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/inspiration-service"; export * from "./src/services/knowledge-service"; export * from "./src/services/summary-service"; export * from "./src/services/task-list-service"; export * from "./src/services/task-service"; export * from "./src/services/journal-relation-service"; export * from "./src/services/journal-context-service"; export * from "./src/services/template-service"; export * from "./src/services/search-service"; export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
const x = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString("base64")}`);
const id = (n) => `${String(n).padStart(8, "0")}-abcd-4abc-8abc-123456789abc`;
const initial = "2026-10-09T00:00:00Z", now = "2026-10-10T00:00:00Z";
async function fixture(type = "riji", refs = []) {
  const files = new Map(), fs = { list: async () => [...files.keys()], read: async (p) => { if (!files.has(p)) throw new x.StoreError("not_found", "missing", p); return files.get(p); }, create: async (p, text) => { if (files.has(p)) throw new x.StoreError("already_exists", "exists", p); files.set(p, text); }, process: async (p, fn) => { const result = fn(await fs.read(p)); files.set(p, result); return result; } };
  const layout = new x.StorageLayout(), clock = { now: () => now }, notes = new x.NoteStore(fs, layout, clock), ledger = new x.LedgerStore(fs, layout, clock);
  let seq = 100, active = true;
  const ids = { next: () => id(seq++) }, operations = new x.OperationService(fs, layout, notes, ledger, clock, ids, { get: async () => id(99) }, { of: async (text) => createHash("sha256").update(text).digest("hex") });
  const index = new x.EntityIndex(fs, layout), service = new x.RelationService(index, operations, ids, () => active);
  const record = (n, type, extra = {}) => x.deriveDateFields(x.normalizeInput({ biaoshi: id(n), shiti: type, jiegoubanben: 2, chuangjianshijian: initial, gengxinshijian: initial, mingcheng: `记录${n}`, biaoqian: [], ...(type === "riji" ? { riqi: "2026-10-09", guanlian: [] } : type === "daiban" ? { guanlian: [] } : type === "xiangmu" ? { daiban: [], shangchuanwenjian: [] } : type === "jizhang" ? { riqi: "2026-10-09", fenlei: "餐饮", jine: 1250 } : {}), ...extra }));
  const add = async (n, type, extra) => { const p = layout.module(type) + (type === "jizhang" ? `/shuju/${id(n)}.json` : `/记录${n}.md`); return (type === "jizhang" ? ledger : notes).create(p, record(n, type, extra), type === "jizhang" ? undefined : "正文不能丢失\n"); };
  const source = await add(1, type, ["riji", "daiban"].includes(type) ? { guanlian: refs, extra: { preserved: true } } : {});
  const types = ["riji", "yuedu", "yingshi", "youxi", "yanchu", "lvxing", "zhishi", "daiban", "xiangmu"];
  const templates = new x.TemplateService(fs, layout, index, operations, clock, ids, "Asia/Shanghai", types);
  const creation = new x.JournalRelationService(index, templates, service, () => active, types);
  const context = new x.JournalContextService(index, new x.SearchService(index, "Asia/Shanghai"), "Asia/Shanghai", [...types, "jizhang"]);
  const tasks = new x.TaskService(index, templates, operations, clock, ids, () => active);
  const list = new x.TaskListService(index, clock, "Asia/Shanghai");
  return { list, tasks, creation, context, templates, files, fs, index, notes, ledger, operations, ids, service, source, add, stop: () => { active = false; } };
}

const all = ["riji", "jizhang", "yuedu", "yingshi", "youxi", "yanchu", "lvxing", "zhishi", "daiban", "xiangmu"];
const summary = f => new x.SummaryService(f.index, { now: () => now }, "Asia/Shanghai", all);
test("home body TODOs exclude checked tasks, code, comments and inactive notes and refresh after edits", async () => {
  const f = await fixture("daiban");
  const original = await f.notes.read(f.source.path);
  await f.notes.update(original.version, { body: '- [ ] 整理资料\n  - [ ] 子步骤\n- [x] 已完成\n```markdown\n- [ ] 代码范例\n```\n<!--\n- [ ] 隐藏范例\n-->\n- [ ] \n' });
  for (const [n, extra] of [[2, { jindu: "yiwancheng", wanchengshijian: now }], [3, { yiquxiao: true, quxiaoshijian: now }], [4, { yiguidang: true }], [5, { yihuishou: true, huishoushijian: now }]]) {
    const note = await f.add(n, "daiban", extra);
    await f.notes.update(note.version, { body: '- [ ] 不应展示\n' });
  }
  const journal = await f.add(6, "riji", { riqi: "2026-10-10" });
  await f.notes.update(journal.version, { body: '- [ ] 日记清单\n' });
  await f.index.rebuild();
  assert.deepEqual(summary(f).read().bodyTodos.map(t => t.text), ["整理资料", "子步骤"]);
  assert.equal(summary(f).read().bodyTodos[0].id, id(1));
  assert.deepEqual(new x.SummaryService(f.index, { now: () => now }, "Asia/Shanghai", ["riji"]).read().bodyTodos, []);
  const current = await f.notes.read(f.source.path);
  await f.notes.update(current.version, { body: current.body.replace('- [ ] 整理资料', '- [x] 整理资料') });
  await f.index.changed(f.source.path);
  assert.deepEqual(summary(f).read().bodyTodos.map(t => t.text), ["子步骤"]);
});
test("ongoing includes all eight progress types, excludes pending/completed/cancelled/archive and honors enabled modules", async () => {
  const f = await fixture(); let n = 2;
  for (const type of all.filter(t => !["riji", "jizhang"].includes(t))) await f.add(n++, type, { [type === "yuedu" ? "zhuangtai" : "jindu"]: "jinxingzhong" });
  await f.add(20, "youxi", { jindu: "weikaishi" }); await f.add(21, "youxi", { jindu: "yiwancheng", wanchengshijian: now }); await f.add(22, "youxi", { jindu: "jinxingzhong", yiquxiao: true, quxiaoshijian: now }); await f.add(23, "youxi", { jindu: "jinxingzhong", yiguidang: true });
  await f.index.rebuild(); const before = [...f.files], result = summary(f).read(); assert.equal(result.ongoing.length, 8); assert.equal(new Set(result.ongoing.map(r => r.type)).size, 8);
  assert.equal(new x.SummaryService(f.index, { now: () => now }, "Asia/Shanghai", ["yuedu"]).read().ongoing.length, 1); assert.deepEqual([...f.files], before);
});
test("today expense uses ledger business date and exact cents, recycled rows excluded, disabled totals unavailable", async () => {
  const f = await fixture(); await f.add(2, "jizhang", { riqi: "2026-10-10", jine: 1250, shouzhi: "zhichu" }); await f.add(3, "jizhang", { riqi: "2026-10-10", jine: 999, shouzhi: "shouru" }); await f.add(4, "jizhang", { riqi: "2026-10-09", jine: 200, shouzhi: "zhichu", chuangjianshijian: now, gengxinshijian: now }); await f.add(5, "jizhang", { riqi: "2026-10-10", jine: 500, shouzhi: "zhichu", yihuishou: true, huishoushijian: now });
  await f.index.rebuild(); assert.equal(summary(f).read().expense, 1250); assert.equal(new x.SummaryService(f.index, { now: () => now }, "Asia/Shanghai", []).read().expense, undefined);
  const tomorrow = new x.SummaryService(f.index, { now: () => "2026-10-10T16:30:00Z" }, "Asia/Shanghai", all); assert.equal(tomorrow.read().today, "2026-10-11"); assert.equal(tomorrow.read().expense, 0);
});
test("today task count agrees with task workbench; subscriptions recompute after native progress edits", async () => {
  const f = await fixture("daiban"), service = summary(f); await f.add(2, "daiban", { kaishiriqi: "2026-10-09", jiezhiriqi: "2026-10-09" }); await f.add(3, "daiban", { kaishiriqi: "2026-10-10", jindu: "jinxingzhong" }); await f.index.rebuild();
  assert.equal(service.read().tasks.length, f.list.query("jintian").total); let updates = 0; const stop = service.subscribe(() => updates++);
  const row = f.index.find(id(3)); await f.tasks.execute(await f.tasks.prepare(row, "yiwancheng")); assert.ok(updates > 0); assert.equal(service.read().ongoing.length, 0); assert.equal(service.read().tasks.length, 0); stop();
});
test("uninitialized and overflowing totals remain unknown, invalid/duplicate/recycled rows excluded", async () => {
  const f = await fixture(); assert.equal(summary(f).read().ready, false); assert.equal(summary(f).read().expense, undefined);
  await f.add(2, "jizhang", { riqi: "2026-10-10", jine: Number.MAX_SAFE_INTEGER, shouzhi: "zhichu" }); await f.add(3, "jizhang", { riqi: "2026-10-10", jine: 1, shouzhi: "zhichu" }); const game = await f.add(4, "youxi", { jindu: "jinxingzhong" }); f.files.set(game.path.replace("记录4", "重复"), f.files.get(game.path)); await f.add(5, "youxi", { jindu: "jinxingzhong", yihuishou: true, huishoushijian: now });
  await f.index.rebuild(); const result = summary(f).read(); assert.equal(result.expense, undefined); assert.ok(result.moneyError); assert.ok(result.issues > 0); assert.equal(result.ongoing.length, 0);
});
test("recent records use updated time, stable ordering and latest twenty limit without truncating ongoing", async () => {
  const f = await fixture(); for (let n = 2; n < 25; n++) await f.add(n, "youxi", { jindu: "jinxingzhong", gengxinshijian: n === 24 ? now : initial }); await f.index.rebuild(); const result = summary(f).read(); assert.equal(result.recent.length, 20); assert.equal(result.recent[0].id, id(24)); assert.equal(result.ongoing.length, 23);
});
test("weekly overview uses Monday and business dates with local completion dates, excludes cancelled and future records", async () => {
  const f = await fixture();
  await f.add(2, "riji", { riqi: "2026-10-10" });
  await f.add(3, "riji", { riqi: "2026-10-04" });
  await f.add(4, "riji", { riqi: "2026-10-11" });
  await f.add(5, "daiban", { jindu: "yiwancheng", wanchengshijian: "2026-10-04T16:30:00Z" });
  await f.add(6, "daiban", { jindu: "yiwancheng", wanchengshijian: now, yiquxiao: true, quxiaoshijian: now });
  await f.add(7, "yuedu", { zhuangtai: "yiwancheng", duwanshijian: now, wanchengshijian: now });
  await f.add(8, "jizhang", { riqi: "2026-10-05", shouzhi: "zhichu", jine: 1250 });
  await f.add(9, "jizhang", { riqi: "2026-10-10", shouzhi: "shouru", jine: 500 });
  await f.add(10, "jizhang", { riqi: "2026-10-04", shouzhi: "zhichu", jine: 999 });
  await f.index.rebuild();
  const result = summary(f).read();
  assert.equal(result.week.start, "2026-10-05");
  assert.equal(result.week.journals, 2);
  assert.equal(result.week.tasks, 1);
  assert.equal(result.week.books, 1);
  assert.equal(result.week.expense, 1250);
  assert.equal(result.todayJournal.id, id(2));
  const disabled = new x.SummaryService(f.index, { now: () => now }, "Asia/Shanghai", []).read();
  assert.equal(disabled.week.journals, undefined); assert.equal(disabled.week.expense, undefined);
  assert.equal(disabled.todayJournal, undefined); assert.equal(disabled.journalEnabled, false);
  const monday = new x.SummaryService(f.index, { now: () => "2026-10-11T16:30:00Z" }, "Asia/Shanghai", all).read();
  assert.equal(monday.week.start, "2026-10-12"); assert.equal(monday.week.journals, 0);
});

test("weekly expense overflow is unknown even when today's expense is valid", async () => {
  const f = await fixture();
  await f.add(2, "jizhang", { riqi: "2026-10-05", shouzhi: "zhichu", jine: Number.MAX_SAFE_INTEGER });
  await f.add(3, "jizhang", { riqi: "2026-10-10", shouzhi: "zhichu", jine: 1 });
  await f.index.rebuild(); const result = summary(f).read();
  assert.equal(result.expense, 1); assert.equal(result.week.expense, undefined); assert.ok(result.week.moneyError);
});
test("lifetime counts full index, archived completions, distinct local days and streak through yesterday", async () => {
  const f = await fixture();
  await f.add(2, "riji", { riqi: "2026-10-08" });
  await f.add(3, "xiangmu", { jindu: "yiwancheng", wanchengshijian: initial, yiguidang: true });
  await f.add(4, "xiangmu", { jindu: "yiwancheng", wanchengshijian: initial, yiquxiao: true, quxiaoshijian: initial });
  await f.add(5, "daiban", { jindu: "yiwancheng", wanchengshijian: initial, yiguidang: true });
  await f.add(6, "yuedu", { zhuangtai: "yiwancheng", duwanshijian: initial, wanchengshijian: initial, yiguidang: true });
  await f.add(7, "jizhang", { riqi: "2026-10-08", shouzhi: "zhichu" });
  await f.add(8, "zhishi", { yihuishou: true, huishoushijian: initial });
  for (let n = 20; n < 45; n++) await f.add(n, "zhishi", { chuangjianshijian: "2026-10-08T16:30:00Z" });
  await f.index.rebuild();
  const result = summary(f).read();
  assert.equal(result.recent.length, 20);
  assert.deepEqual(result.lifetime, { days: 2, notes: 31, projects: 1, tasks: 1, books: 1, knowledge: 25, streak: 2, newThisWeek: 31, firstDate: "2026-10-08" });
  const disabled = new x.SummaryService(f.index, { now: () => now }, "Asia/Shanghai", []).read().lifetime;
  assert.equal(disabled.days, 0); assert.equal(disabled.projects, undefined); assert.equal(disabled.firstDate, undefined);
});
test("inspiration persists Markdown, retries without duplicates, edits safely and excludes recycled notes", async () => {
  const f = await fixture(); await f.index.rebuild();
  const knowledge = new x.KnowledgeService(f.index, f.operations, { now: () => now }, f.ids, () => true);
  const service = new x.InspirationService(f.index, f.templates, knowledge);
  await assert.rejects(service.prepare("  "), /请填写/);
  await assert.rejects(service.prepare("a".repeat(2001)), /2000/);
  const draft = await service.prepare("第一条灵感\n第二行");
  await service.execute(draft); await service.execute(draft);
  assert.equal(service.list().length, 1);
  const source = service.list()[0];
  assert.equal(source.body, "第一条灵感\n第二行\n"); assert.equal(source.attributes.neirong, "第一条灵感\n第二行");
  assert.ok(source.attributes.biaoqian.includes("灵感便签"));
  const edit = await service.prepare("修改后的灵感", source); await service.execute(edit);
  assert.equal(service.list()[0].attributes.neirong, "修改后的灵感");
  await assert.rejects(service.prepare("不覆盖", source), /已变化/);
  const current = service.list()[0]; await f.notes.update(current.version, { set: { yihuishou: true, huishoushijian: now } }); await f.index.changed(current.path);
  assert.equal(service.list().length, 0);
});
test("deadline scope and linked project progress use real records", async () => {
  const f = await fixture();
  await f.add(2, "daiban", { jindu: "yiwancheng", wanchengshijian: now });
  await f.add(3, "daiban", { jiezhiriqi: "2026-10-11" });
  await f.add(4, "xiangmu", { jindu: "jinxingzhong", daiban: [id(2), id(3)], jiezhiriqi: "2026-10-09" });
  await f.add(5, "daiban", { jiezhiriqi: "2026-10-18" });
  await f.add(6, "daiban", { jiezhiriqi: "2026-10-11", yiquxiao: true, quxiaoshijian: now });
  await f.index.rebuild(); const result = summary(f).read();
  assert.deepEqual(result.deadlines.map(s => s.id), [id(4), id(3)]);
  assert.equal(result.ongoing.find(s => s.id === id(4)).percent, 50);
});
