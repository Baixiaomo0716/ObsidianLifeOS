import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/knowledge-service"; export * from "./src/services/journal-ledger-relation-service"; export * from "./src/services/summary-service"; export * from "./src/services/ledger-table-service"; export * from "./src/services/project-service"; export * from "./src/services/project-lifecycle-service"; export * from "./src/services/project-file-service"; export * from "./src/services/attachment-reference-service"; export * from "./src/storage/attachment-store"; export * from "./src/services/ledger-service"; export * from "./src/settings/settings-store"; export * from "./src/services/task-service"; export * from "./src/services/journal-relation-service"; export * from "./src/services/journal-context-service"; export * from "./src/services/template-service"; export * from "./src/services/search-service"; export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
const x = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString("base64")}`);
const id = (n) => `${String(n).padStart(8, "0")}-abcd-4abc-8abc-123456789abc`;
const initial = "2026-10-09T00:00:00Z", now = "2026-10-10T00:00:00Z";
test("diary creates knowledge and returns stable selection through knowledge edit and retry", async () => {
  const f = await fixture(); await f.add(2, "yuedu");
  const draft = await f.creation.prepare(f.source, [id(2)], "zhishi", "日记新建知识"), result = await f.creation.execute(draft);
  assert.deepEqual(new Set(result.selected), new Set([id(2), result.id]));
  const knowledge = new x.KnowledgeService(f.index, f.operations, { now: () => now }, f.ids, () => true), source = knowledge.get(result.id);
  const edit = await knowledge.prepare(source, { fields: { neirong: "知识内容", biaoqian: ["学习"] }, progress: "jinxingzhong", body: "[[阅读笔记]]\n自由正文" });
  await knowledge.execute(edit); const again = await f.creation.execute(draft);
  assert.equal(again.id, result.id); assert.equal(knowledge.incoming(result.id).length, 1); assert.equal(f.index.all().filter(s => s.attributes.shiti === "zhishi").length, 1);
  assert.equal(knowledge.get(result.id).body, "[[阅读笔记]]\n自由正文");
});
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
  const ledgerCreation = new x.JournalLedgerRelationService(index, entry, service, () => active);
  const summary = new x.SummaryService(index, clock, "Asia/Shanghai", settings.qiyongmokuai), projects = new x.ProjectService(index, operations, clock, ids, () => active), flows = new x.ProjectLifecycleService(fs, layout, index, operations, clock, ids, { of: async raw => createHash("sha256").update(raw).digest("hex") }, () => active);
  const table = new x.LedgerTableService(index, operations, clock, ids, () => settings, () => active), bytes = new Map(), binary = { read: async path => { if (!bytes.has(path)) throw new x.StoreError("not_found", "missing"); return bytes.get(path).slice(0); }, create: async (path, data) => { if (bytes.has(path)) throw Error("exists"); bytes.set(path, data.slice(0)); } };
  const attachments = new x.AttachmentStore(fs, binary, layout, clock, ids, { of: async data => createHash("sha256").update(new Uint8Array(data)).digest("hex") }, 100, () => active), references = new x.AttachmentReferenceService(index, attachments, operations, ids, () => active), projectFiles = new x.ProjectFileService(index, attachments, references, () => active);
  return { layout, ledgerCreation, summary, projects, flows, table, attachments, references, projectFiles, bytes, entry, settings, tasks, creation, context, templates, files, fs, index, notes, ledger, operations, ids, service, source, add, stop: () => { active = false; } };
}

const input = { date: "2026-10-10", kind: "zhichu", category: "餐饮", amount: "12.50", tags: ["生活"] };
test("ledger create-return validates context before writes and preserves JSON cents, diary body and cross-type selections", async () => {
  const f = await fixture(); await f.add(2, "zhishi"); const before = [...f.files], draft = await f.ledgerCreation.prepare(f.source, [id(2)], input); assert.deepEqual([...f.files], before);
  const [one, two] = await Promise.all([f.ledgerCreation.execute(draft), f.ledgerCreation.execute(draft)]); assert.equal(one.id, two.id); assert.deepEqual(one.selected, [id(2), one.id]); assert.equal(one.source.body, f.source.body); assert.deepEqual(one.source.attributes.extra, { preserved: true }); assert.equal(f.index.find(one.id).attributes.jine, 1250); assert.equal(f.summary.read().expense, 1250); assert.equal(f.table.query().total, 1); assert.equal(JSON.parse(f.table.export({}, "json"))[0].金额, 1250);
});
test("invalid selections, stale diary, unsupported source, invalid amount and stopped service create no files", async () => {
  const f = await fixture(), before = [...f.files]; await assert.rejects(f.ledgerCreation.prepare(f.source, [id(99)], input)); await assert.rejects(f.ledgerCreation.prepare(f.source, [], { ...input, amount: "0" })); const task = await f.add(2, "daiban"); await assert.rejects(f.ledgerCreation.prepare(task, [], input)); await f.fs.process(f.source.path, raw => raw + "手工正文"); await assert.rejects(f.ledgerCreation.prepare(f.source, [], input)); assert.equal(f.table.query().total, 0); assert.equal([...f.files.keys()].filter(p => p.endsWith(".json")).length, 0);
  const fresh = await f.notes.read(f.source.path), draft = await f.ledgerCreation.prepare(fresh, [], input), paused = [...f.files]; f.stop(); await assert.rejects(f.ledgerCreation.execute(draft)); await assert.rejects(f.ledgerCreation.execute({ id: id(98) })); assert.deepEqual([...f.files], paused);
});
test("uncertain ledger write retries same request and creates exactly one row before returning", async () => {
  const f = await fixture(), actual = f.fs.create; let first = true;
  f.fs.create = async (path, raw) => { await actual(path, raw); if (path.includes("/shuju/") && first) { first = false; throw new x.StoreError("io", "lost ledger receipt"); } };
  const draft = await f.ledgerCreation.prepare(f.source, [], input); await assert.rejects(f.ledgerCreation.execute(draft)); const result = await f.ledgerCreation.execute(draft); assert.deepEqual(result.selected, [draft.id]); assert.equal(f.table.query().total, 1); assert.equal(f.summary.read().expense, 1250);
});
test("uncertain association retry never recreates ledger, replays original receipt and preserves later diary edits", async () => {
  const f = await fixture(), actual = f.service.execute.bind(f.service); let first = true;
  f.service.execute = async draft => { await actual(draft); if (first) { first = false; throw Error("lost association receipt"); } };
  const draft = await f.ledgerCreation.prepare(f.source, [], input); await assert.rejects(f.ledgerCreation.execute(draft), /记账已保留/); const saved = await f.notes.read(f.source.path); await f.fs.process(saved.path, raw => raw + "后续手工正文"); f.files.delete(f.index.find(draft.id).path); await f.index.rebuild(); const result = await f.ledgerCreation.execute(draft); assert.deepEqual(result.selected, [draft.id]); assert.ok(result.source.body.endsWith("后续手工正文")); assert.equal(f.index.find(draft.id), undefined); assert.equal(f.table.query().total, 0);
});
test("diary native edit between ledger and association is protected and ledger remains available for manual linking", async () => {
  const f = await fixture(), actual = f.entry.execute.bind(f.entry);
  f.entry.execute = async draft => { const id = await actual(draft); await f.fs.process(f.source.path, raw => raw + "手工改动"); return id; };
  const draft = await f.ledgerCreation.prepare(f.source, [], input); await assert.rejects(f.ledgerCreation.execute(draft), /记账已保留/); await assert.rejects(f.ledgerCreation.execute(draft), /已变化/); assert.equal(f.table.query().total, 1); const current = await f.notes.read(f.source.path); assert.ok(current.body.endsWith("手工改动")); assert.deepEqual(current.attributes.guanlian, []);
  await f.service.execute(await f.service.prepare(current, [draft.id])); assert.deepEqual((await f.notes.read(current.path)).attributes.guanlian, [draft.id]); assert.equal(f.summary.read().expense, 1250);
});
test("diary to task/project to attachment to close/reopen updates reverse ratio and homepage without double-writing project tasks", async () => {
  const f = await fixture(), project = await f.add(2, "xiangmu", { jindu: "jinxingzhong" }), created = await f.creation.execute(await f.creation.prepare(f.source, [id(2)], "daiban", "集成待办"));
  await f.service.execute(await f.service.prepare(f.index.find(created.id), [id(2)])); await f.tasks.execute(await f.tasks.prepare(f.index.find(created.id), "jinxingzhong")); assert.equal(f.projects.detail(id(2)).ratio, 0); assert.equal(f.summary.read().ongoing.length, 2);
  const source = { name: "项目资料.pdf", type: "application/pdf", size: 3, arrayBuffer: async () => Uint8Array.from([1,2,3]).buffer }, file = await f.attachments.execute(await f.attachments.prepare(source, id(2)));
  await f.references.execute(await f.references.prepare(f.index.find(id(2)), [file.路径])); const currentProject = f.index.find(id(2)); assert.equal((await f.projectFiles.list(currentProject))[0].info.字节数, 3); assert.equal(await f.projectFiles.open(currentProject, file.路径), file.路径);
  await f.tasks.execute(await f.tasks.prepare(f.index.find(created.id), "yiwancheng")); assert.equal(f.projects.detail(id(2)).ratio, 1); await f.flows.execute(await f.flows.prepare(f.index.find(id(2)), "wancheng")); assert.equal(f.summary.read().ongoing.length, 0);
  await f.flows.execute(await f.flows.prepare(f.index.find(id(2)), "chongkai")); assert.equal(f.summary.read().ongoing.length, 1); const reopened = f.index.find(id(2)); await f.projectFiles.executeRemove(await f.projectFiles.prepareRemove(reopened, file.路径)); assert.ok(f.bytes.has(file.路径)); assert.deepEqual(f.index.find(id(2)).attributes.daiban, []); assert.equal(f.projects.detail(id(2)).total, 1); assert.equal((await f.notes.read(project.path)).body, project.body);
});
test("version conflict pauses stale task update; independent copy preserves source and never enters ongoing aggregation", async () => {
  const f = await fixture("daiban"), draft = await f.tasks.prepare(f.source, "jinxingzhong"); await f.fs.process(f.source.path, raw => raw + "另一端正文"); const actual = f.files.get(f.source.path); await assert.rejects(f.tasks.execute(draft), /已变化/); assert.equal(f.files.get(f.source.path), actual);
  const handler = new x.ConflictHandler(f.fs, f.layout, f.operations), copy = await handler.capture(f.source.version, { set: { jindu: "jinxingzhong" } }), operationId = f.ids.next(); await handler.saveCopy(operationId, copy); const after = [...f.files]; await handler.saveCopy(operationId, copy); assert.deepEqual([...f.files], after); assert.equal(f.files.get(f.source.path), actual); await f.index.rebuild(); assert.equal(f.summary.read().ongoing.length, 0); assert.ok([...f.files.keys()].some(path => path.includes("冲突")));
});
