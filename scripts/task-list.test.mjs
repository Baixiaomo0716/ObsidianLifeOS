import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/task-list-service"; export * from "./src/services/task-service"; export * from "./src/services/journal-relation-service"; export * from "./src/services/journal-context-service"; export * from "./src/services/template-service"; export * from "./src/services/search-service"; export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
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

test("exclusive grouping gives overdue priority, unscheduled no-project inbox and all includes management states", async () => {
  const f = await fixture("daiban");
  await f.add(2, "daiban", { kaishiriqi: "2026-10-10", jiezhiriqi: "2026-10-10" });
  await f.add(3, "daiban", { jiezhiriqi: "2026-10-09" });
  await f.add(4, "daiban", { jindu: "yiwancheng", wanchengshijian: now });
  await f.add(5, "daiban", { yiquxiao: true, quxiaoshijian: now }); await f.add(6, "daiban", { yiguidang: true });
  await f.add(7, "xiangmu"); await f.add(8, "daiban", { guanlian: [id(7)] });
  await f.index.rebuild(); const before = [...f.files];
  assert.deepEqual(f.list.query("shoujixiang").items.map((r) => r.id), [id(1)]);
  assert.deepEqual(f.list.query("jintian").items.map((r) => r.id), [id(2)]); assert.deepEqual(f.list.query("yuqi").items.map((r) => r.id), [id(3)]);
  assert.equal(f.list.query("quanbu").total, 7); assert.deepEqual([...f.files], before);
});
test("business date rolls forward without copying, readonly search and pagination clamp", async () => {
  const f = await fixture("daiban"); await f.add(2, "daiban", { jiezhiriqi: "2026-10-10" }); await f.index.rebuild(); const before = [...f.files];
  const tomorrow = new x.TaskListService(f.index, { now: () => "2026-10-10T16:30:00Z" }, "Asia/Shanghai");
  assert.equal(tomorrow.query("yuqi").items[0].id, id(2)); assert.equal(tomorrow.query("jintian").total, 0);
  assert.equal(f.list.query("quanbu", "正文不能丢失", 100).page, 1); assert.deepEqual([...f.files], before);
});
test("invalid, recycled and duplicate identity excluded from task page", async () => {
  const f = await fixture("daiban"); await f.add(2, "daiban", { yihuishou: true, huishoushijian: now });
  f.files.set(f.source.path.replace("记录1", "重复"), f.files.get(f.source.path)); await f.index.rebuild();
  assert.equal(f.list.query("quanbu").total, 0); assert.ok(f.list.query("quanbu").issues > 0);
});
test("dates save only date fields, clearing values and unchanged save preserve original", async () => {
  const f = await fixture("daiban", [id(88)]);
  await f.tasks.execute(await f.tasks.prepareDates(f.source, "2026-10-10", "2026-10-11")); let source = await f.notes.read(f.source.path);
  assert.equal(source.attributes.kaishiriqi, "2026-10-10"); assert.equal(source.body, f.source.body); assert.deepEqual(source.attributes.guanlian, [id(88)]);
  const before = [...f.files]; await f.tasks.execute(await f.tasks.prepareDates(source, "2026-10-10", "2026-10-11")); assert.deepEqual([...f.files], before);
  await f.tasks.execute(await f.tasks.prepareDates(source, "", "")); source = await f.notes.read(f.source.path); assert.equal(source.attributes.jiezhiriqi, undefined);
});
test("bad and reversed dates never write, stale dates and uncertain response preserve receipt", async () => {
  const f = await fixture("daiban"), before = [...f.files];
  await assert.rejects(f.tasks.prepareDates(f.source, "2026-02-30", "")); await assert.rejects(f.tasks.prepareDates(f.source, "2026-10-12", "2026-10-11")); assert.deepEqual([...f.files], before);
  const draft = await f.tasks.prepareDates(f.source, "", "2026-10-11"), run = f.operations.run.bind(f.operations); let first = true;
  f.operations.run = async (req) => { const receipt = await run(req); if (first) { first = false; throw Error("uncertain"); } return receipt; };
  await assert.rejects(f.tasks.execute(draft)); await f.tasks.execute(draft); assert.equal((await f.notes.read(f.source.path)).attributes.jiezhiriqi, "2026-10-11");
  await assert.rejects(f.tasks.prepareDates(f.source, "", ""), /变化/);
});
test("project reassignment edits only task and rejects multiple or newly closed projects", async () => {
  const f = await fixture("daiban"); const project = await f.add(2, "xiangmu"); await f.add(3, "xiangmu"); await f.add(4, "xiangmu", { jindu: "yiwancheng", wanchengshijian: now }); const raw = f.files.get(project.path);
  await assert.rejects(f.service.prepare(f.source, [id(2), id(3)])); await assert.rejects(f.service.prepare(f.source, [id(4)]));
  await f.service.execute(await f.service.prepare(f.source, [id(2)])); assert.equal(f.files.get(project.path), raw);
  const source = await f.notes.read(f.source.path); await f.service.execute(await f.service.prepare(source, [id(3)])); assert.deepEqual((await f.notes.read(source.path)).attributes.guanlian, [id(3)]);
});
