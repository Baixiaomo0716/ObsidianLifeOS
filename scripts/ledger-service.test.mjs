import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/ledger-service"; export * from "./src/settings/settings-store"; export * from "./src/services/task-service"; export * from "./src/services/journal-relation-service"; export * from "./src/services/journal-context-service"; export * from "./src/services/template-service"; export * from "./src/services/search-service"; export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
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
  return { entry, settings, tasks, creation, context, templates, files, fs, index, notes, ledger, operations, ids, service, source, add, stop: () => { active = false; } };
}

const input = { date: "2026-10-10", kind: "zhichu", category: "餐饮", amount: "12.50", tags: ["生活", "生活"] };
test("prepare cancellation does not write; ledger derives weekday and stores Chinese integer cents without MD", async () => {
  const f = await fixture(), before = [...f.files], draft = f.entry.prepare(input); assert.deepEqual([...f.files], before);
  const id = await f.entry.execute(draft), row = f.index.find(id); assert.equal(row.attributes.jine, 1250); assert.equal(row.attributes.xingqi, "星期六"); assert.deepEqual(row.attributes.biaoqian, ["生活"]);
  assert.ok(row.path.endsWith(".json")); assert.match(f.files.get(row.path), /"金额": 1250/); assert.equal([...f.files.keys()].filter((p) => p.endsWith(".md")).length, 1);
});
test("income and expense categories cannot cross and disabled categories cannot be used", async () => {
  const f = await fixture(); assert.throws(() => f.entry.prepare({ ...input, kind: "shouru" }));
  const draft = f.entry.prepare({ ...input, kind: "shouru", category: "其他收入" }); await f.entry.execute(draft); assert.equal(f.index.find(draft.id).attributes.shouzhi, "shouru");
  const pending = f.entry.prepare(input); f.settings.fenlei.find((c) => c.fenlei === "餐饮").qiyong = false; await assert.rejects(f.entry.execute(pending));
  assert.throws(() => f.entry.prepare(input));
});
test("invalid amounts, dates and tags fail before writes", async () => {
  const f = await fixture(), before = [...f.files];
  for (const amount of ["0", "-1", "1.001", "1e2", "Infinity", "90071992547409.92", ""]) assert.throws(() => f.entry.prepare({ ...input, amount }));
  assert.throws(() => f.entry.prepare({ ...input, date: "2026-02-30" })); assert.throws(() => f.entry.prepare({ ...input, tags: [12] })); assert.deepEqual([...f.files], before);
});
test("double submit and uncertain receipt use one JSON row and immutable captured input", async () => {
  const f = await fixture(), value = { ...input, tags: ["原标签"] }, draft = f.entry.prepare(value), actual = f.operations.run.bind(f.operations); let first = true;
  value.tags[0] = "修改"; value.amount = "99";
  f.operations.run = async (req) => { const result = await actual(req); if (first) { first = false; throw Error("uncertain"); } return result; };
  await assert.rejects(f.entry.execute(draft)); assert.deepEqual(await Promise.all([f.entry.execute(draft), f.entry.execute(draft)]), [draft.id, draft.id]);
  assert.equal(f.index.all().filter((s) => s.attributes.shiti === "jizhang").length, 1); assert.equal(f.index.find(draft.id).attributes.jine, 1250); assert.deepEqual(f.index.find(draft.id).attributes.biaoqian, ["原标签"]);
});
test("foreign, stopped and disabled modules never write", async () => {
  const f = await fixture(), draft = f.entry.prepare(input), before = [...f.files]; await assert.rejects(f.entry.execute({ id: draft.id }));
  f.settings.qiyongmokuai = []; assert.throws(() => f.entry.prepare(input)); await assert.rejects(f.entry.execute(draft)); f.stop(); await assert.rejects(f.entry.execute(draft)); assert.deepEqual([...f.files], before);
});
test("separate intentional entries remain separate and tags do not change old data", async () => {
  const f = await fixture(), a = f.entry.prepare(input), b = f.entry.prepare(input); await f.entry.execute(a); const original = f.files.get(f.index.find(a.id).path); await f.entry.execute(b);
  assert.notEqual(a.id, b.id); assert.equal(f.index.all().filter((s) => s.attributes.shiti === "jizhang").length, 2); assert.equal(f.files.get(f.index.find(a.id).path), original);
});
