import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/ledger-table-service"; export * from "./src/services/ledger-service"; export * from "./src/settings/settings-store"; export * from "./src/services/task-service"; export * from "./src/services/journal-relation-service"; export * from "./src/services/journal-context-service"; export * from "./src/services/template-service"; export * from "./src/services/search-service"; export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
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
  const settings = x.defaultSettings();
  const entry = new x.LedgerService(layout, operations, index, clock, ids, () => settings, () => active);
  const table = new x.LedgerTableService(index, operations, clock, ids, () => settings, () => active);
  return { table, entry, settings, tasks, creation, context, templates, files, fs, index, notes, ledger, operations, ids, service, source, add, stop: () => { active = false; } };
}

const edit = { date: "2026-10-10", kind: "zhichu", category: "餐饮", amount: "15.30", tags: ["午餐"] };
test("filter rows, totals and exports share full selection rather than current page", async () => {
  const f = await fixture(); for (let n = 2; n < 54; n++) await f.add(n, "jizhang", { biaoqian: ["午餐"] }); await f.index.rebuild();
  const result = f.table.query({ tag: "午餐", page: 2 }); assert.equal(result.total, 52); assert.equal(result.items.length, 2); assert.equal(result.totals.zhichu, 52 * 1250);
  assert.equal(JSON.parse(f.table.export({ tag: "午餐", page: 2 }, "json")).length, 52); assert.equal(f.table.export({ tag: "午餐" }, "csv").split("\r\n").length, 53);
  assert.equal(f.table.query({ from: "2026-10-10" }).total, 0); assert.equal(f.table.query({ kind: "shouru" }).total, 0); assert.equal(f.table.query({ category: "餐饮" }).total, 52);
});
test("editing updates business fields and weekday but preserves ID and unknown data", async () => {
  const f = await fixture(), row = await f.add(2, "jizhang", { nested: { keep: true } });
  await f.table.execute(await f.table.prepareEdit(row, edit)); const saved = f.index.find(id(2));
  assert.equal(saved.attributes.jine, 1530); assert.equal(saved.attributes.xingqi, "星期六"); assert.deepEqual(saved.attributes.nested, { keep: true }); assert.equal(saved.path, row.path);
});
test("historical stopped category can remain, new stopped assignment and reversed dates rejected", async () => {
  const f = await fixture(), row = await f.add(2, "jizhang"); f.settings.fenlei = [];
  await f.table.execute(await f.table.prepareEdit(row, edit)); const source = f.index.find(id(2));
  await assert.rejects(f.table.prepareEdit(source, { ...edit, kind: "shouru" })); await assert.rejects(f.table.prepareEdit(source, { ...edit, date: "2026-02-30" }));
  assert.ok(f.table.query({ from: "2026-10-11", to: "2026-10-10" }).error); assert.throws(() => f.table.export({ from: "bad" }, "json"));
});
test("recycle and restore preserve original ID, references and valid row totals", async () => {
  const f = await fixture("riji", [id(2)]), row = await f.add(2, "jizhang");
  await f.table.execute(await f.table.prepareRecycle(row, true)); assert.equal(f.table.query().total, 0); const recycled = f.table.query({ recycled: true }); assert.equal(recycled.total, 1); assert.equal(recycled.totals.zhichu, 0);
  await assert.rejects(f.table.prepareEdit(recycled.rows[0], edit)); await f.table.execute(await f.table.prepareRecycle(recycled.rows[0], false));
  assert.equal(f.table.query().totals.zhichu, 1250); assert.deepEqual((await f.notes.read(f.source.path)).attributes.guanlian, [id(2)]);
});
test("native concurrent edit blocks old draft and uncertain retry uses same request", async () => {
  const f = await fixture(), row = await f.add(2, "jizhang"), draft = await f.table.prepareEdit(row, edit);
  await f.ledger.update(row.version, { set: { biaoqian: ["手工修改"] } }); await assert.rejects(f.table.execute(draft), /变化/);
  const current = await f.ledger.read(row.path), retry = await f.table.prepareEdit(current, edit), run = f.operations.run.bind(f.operations); let first = true;
  f.operations.run = async (request) => { const result = await run(request); if (first) { first = false; throw Error("uncertain"); } return result; };
  await assert.rejects(f.table.execute(retry)); await f.table.execute(retry); assert.equal(f.index.find(id(2)).attributes.jine, 1530);
});
test("CSV escapes quotes, newlines and formula text; JSON keeps original field keys and unknown metadata", async () => {
  const f = await fixture(); await f.add(2, "jizhang", { fenlei: '=1+1,"\n分类', biaoqian: ["@公式"], unknown: { keep: 1 } }); await f.index.rebuild(); const before = [...f.files];
  const csv = f.table.export({}, "csv"); assert.ok(csv.startsWith("\uFEFF")); assert.ok(csv.includes("'=1+1")); assert.ok(csv.includes('""')); assert.ok(csv.includes("'@公式"));
  const raw = JSON.parse(f.table.export({}, "json"))[0]; assert.equal(raw.金额, 1250); assert.deepEqual(raw.unknown, { keep: 1 }); assert.deepEqual([...f.files], before);
});
test("invalid and duplicate rows excluded and overflow blocks partial statistics and export", async () => {
  const f = await fixture(); await f.add(2, "jizhang", { shouzhi: "shouru", jine: Number.MAX_SAFE_INTEGER }); await f.add(3, "jizhang", { shouzhi: "shouru", jine: 1 }); await f.index.rebuild();
  assert.ok(f.table.query().error); assert.equal(f.table.query().totals, undefined); assert.throws(() => f.table.export({}, "csv"));
  const row = f.index.find(id(3)), raw = JSON.parse(f.files.get(row.path)); raw.金额 = -1; f.files.set(row.path, JSON.stringify(raw)); await f.index.rebuild(); assert.equal(f.table.query().total, 1);
});
test("stopped and foreign edit requests never write and exports require ready index", async () => {
  const f = await fixture(), row = await f.add(2, "jizhang"); assert.throws(() => f.table.export({}, "json"));
  const draft = await f.table.prepareEdit(row, edit), before = [...f.files]; await assert.rejects(f.table.execute({ id: id(2) })); f.stop(); await assert.rejects(f.table.execute(draft)); assert.deepEqual([...f.files], before);
});
