import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/project-lifecycle-service"; export * from "./src/services/project-service"; export * from "./src/services/task-service"; export * from "./src/services/journal-relation-service"; export * from "./src/services/journal-context-service"; export * from "./src/services/template-service"; export * from "./src/services/search-service"; export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
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
  const projects = new x.ProjectService(index, operations, clock, ids, () => active);
  const flows = new x.ProjectLifecycleService(fs, layout, index, operations, clock, ids, { of: async (raw) => createHash("sha256").update(raw).digest("hex") }, () => active);
  const recreate = () => new x.ProjectLifecycleService(fs, layout, index, operations, clock, ids, { of: async (raw) => createHash("sha256").update(raw).digest("hex") }, () => active);
  return { flows, recreate, projects, tasks, creation, context, templates, files, fs, index, notes, ledger, operations, ids, service, source, add, stop: () => { active = false; } };
}

test("every pending task requires explicit choice before any business change", async () => {
  const f = await fixture("xiangmu"); await f.add(2, "daiban", { guanlian: [id(1)] }); const before = [...f.files];
  await assert.rejects(f.flows.prepare(f.source, "wancheng"), /每条/); assert.deepEqual([...f.files], before);
});
test("keep, cancel and detach execute individually then complete project last", async () => {
  const f = await fixture("xiangmu"); for (const n of [2, 3, 4]) await f.add(n, "daiban", { guanlian: [id(1), id(88)] });
  const draft = await f.flows.prepare(f.source, "wancheng", { [id(2)]: "baoliu", [id(3)]: "quxiao", [id(4)]: "yichu" }), events = [];
  await f.flows.execute(draft, (path, status) => events.push([path, status]));
  assert.equal(f.index.find(id(1)).attributes.jindu, "yiwancheng"); assert.equal(f.index.find(id(2)).attributes.jindu, "weikaishi"); assert.equal(f.index.find(id(3)).attributes.yiquxiao, true);
  assert.deepEqual(f.index.find(id(4)).attributes.guanlian, [id(88)]); assert.equal(events.at(-1)[0], f.source.path);
});
test("partial failure keeps successes and new service resumes persisted original requests", async () => {
  const f = await fixture("xiangmu"), a = await f.add(2, "daiban", { guanlian: [id(1)] }), b = await f.add(3, "daiban", { guanlian: [id(1)] }), run = f.operations.run.bind(f.operations); let first = true;
  f.operations.run = async (req) => { if (req.buzhou[0].banben.path === a.path && first) { first = false; throw Error("synthetic failure"); } return run(req); };
  const draft = await f.flows.prepare(f.source, "wancheng", { [id(2)]: "quxiao", [id(3)]: "quxiao" }); await assert.rejects(f.flows.execute(draft));
  assert.equal(f.index.find(id(1)).attributes.jindu, "weikaishi"); assert.equal(f.index.find(id(3)).attributes.yiquxiao, true); const savedB = f.files.get(b.path);
  const restored = f.recreate(); await restored.execute(await restored.restore(draft.id)); assert.equal(f.files.get(b.path), savedB); assert.equal(f.index.find(id(1)).attributes.jindu, "yiwancheng");
});
test("uncertain final receipt recovers after restart and does not replay completed project edits", async () => {
  const f = await fixture("xiangmu"), draft = await f.flows.prepare(f.source, "wancheng"), run = f.operations.run.bind(f.operations); let first = true;
  f.operations.run = async (req) => { const result = await run(req); if (first) { first = false; throw Error("uncertain"); } return result; }; await assert.rejects(f.flows.execute(draft));
  const current = await f.notes.read(f.source.path); const native = await f.notes.update(current.version, { body: "后续手工正文" }); const restored = f.recreate();
  await restored.execute(await restored.restore(draft.id)); assert.equal(f.files.get(native.path), native.version.original);
});
test("new task appearing before final closure blocks completion after successful task work", async () => {
  const f = await fixture("xiangmu"), task = await f.add(2, "daiban", { guanlian: [id(1)] }), draft = await f.flows.prepare(f.source, "wancheng", { [id(2)]: "quxiao" }), run = f.operations.run.bind(f.operations); let first = true;
  f.operations.run = async (req) => { const result = await run(req); if (first) { first = false; await f.add(3, "daiban", { guanlian: [id(1)] }); } return result; };
  await assert.rejects(f.flows.execute(draft), /新待办/); assert.equal(f.index.find(id(1)).attributes.jindu, "weikaishi"); assert.equal((await f.notes.read(task.path)).attributes.yiquxiao, true);
});
test("changed project before execution pauses all task changes", async () => {
  const f = await fixture("xiangmu"), task = await f.add(2, "daiban", { guanlian: [id(1)] }), draft = await f.flows.prepare(f.source, "wancheng", { [id(2)]: "quxiao" });
  await f.notes.update(f.source.version, { body: "手工项目修改" }); await assert.rejects(f.flows.execute(draft), /原项目已变化/); assert.equal((await f.notes.read(task.path)).attributes.yiquxiao, false);
});
test("cancel and archive only change project; reopen resets management flags and preserves tasks", async () => {
  const f = await fixture("xiangmu"), task = await f.add(2, "daiban", { guanlian: [id(1)] }), raw = f.files.get(task.path);
  const completed = await f.notes.update(f.source.version, { set: { jindu: "yiwancheng", wanchengshijian: now } });
  await f.flows.execute(await f.flows.prepare(completed, "quxiao")); await f.flows.execute(await f.flows.prepare(f.index.find(id(1)), "guidang"));
  assert.equal(f.index.find(id(1)).attributes.yiquxiao, true); assert.equal(f.index.find(id(1)).attributes.yiguidang, true);
  await f.flows.execute(await f.flows.prepare(f.index.find(id(1)), "chongkai")); const project = f.index.find(id(1));
  assert.equal(project.attributes.jindu, "jinxingzhong"); assert.equal(project.attributes.yiquxiao, false); assert.equal(project.attributes.yiguidang, false); assert.equal(project.attributes.quxiaoshijian, undefined); assert.equal(project.attributes.wanchengshijian, undefined); assert.equal(f.files.get(task.path), raw);
});
test("corrupted intents, foreign requests and stopped services never mutate business records", async () => {
  const f = await fixture("xiangmu"), draft = await f.flows.prepare(f.source, "wancheng"), path = [...f.files.keys()].find((p) => p.includes("project-flows")), raw = JSON.parse(f.files.get(path)); raw.payload = "{}"; f.files.set(path, JSON.stringify(raw));
  await assert.rejects(f.recreate().restore(draft.id), /损坏/); await assert.rejects(f.flows.execute({ id: draft.id })); const before = [...f.files]; f.stop(); await assert.rejects(f.flows.execute(draft)); assert.deepEqual([...f.files], before);
});
test("referenced project cannot be recycled while valid or recycled tasks retain inbound links", async () => {
  for (const recycled of [false, true]) {
    const f = await fixture("xiangmu"); await f.add(2, "daiban", { guanlian: [id(1)], ...(recycled ? { yihuishou: true, huishoushijian: now } : {}) });
    await assert.rejects(new x.TrashStore(f.index, { now: () => now }).prepare(f.source, true), /引用/);
  }
});
