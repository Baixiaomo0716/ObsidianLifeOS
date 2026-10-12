import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/project-service"; export * from "./src/services/task-service"; export * from "./src/services/journal-relation-service"; export * from "./src/services/journal-context-service"; export * from "./src/services/template-service"; export * from "./src/services/search-service"; export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
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
  return { projects, tasks, creation, context, templates, files, fs, index, notes, ledger, operations, ids, service, source, add, stop: () => { active = false; } };
}

const input = { start: "2026-10-10", end: "2026-10-11", progress: "jinxingzhong", body: "项目正文\n- [x] 正文勾选不影响待办\n" };
test("project creation needs only title; unknown ratio and body optional", async () => {
  const f = await fixture("xiangmu"), draft = await f.templates.prepare("xiangmu", "我的项目"), path = await f.templates.execute(draft);
  await f.index.rebuild(); const project = f.index.all().find((s) => s.path === path); assert.ok(project); assert.equal(f.projects.detail(project.attributes.biaoshi).ratio, null); assert.equal(path.split("/").pop(), "我的项目.md");
});
test("derived tasks ignore stored legacy project list, exclude cancelled but retain archived work", async () => {
  const f = await fixture("xiangmu"); await f.add(2, "daiban", { guanlian: [id(1)], jindu: "yiwancheng", wanchengshijian: now, yiguidang: true });
  await f.add(3, "daiban", { guanlian: [id(1)] }); await f.add(4, "daiban", { guanlian: [id(1)], yiquxiao: true, quxiaoshijian: now }); await f.add(5, "daiban"); await f.index.rebuild();
  const before = [...f.files], result = f.projects.detail(id(1)); assert.equal(result.tasks.length, 3); assert.equal(result.completed, 1); assert.equal(result.total, 2); assert.equal(result.ratio, .5); assert.deepEqual([...f.files], before); assert.equal(result.project.attributes.jindu, "weikaishi");
});
test("relation changes immediately recompute ratio without touching project", async () => {
  const f = await fixture("xiangmu"), task = await f.add(2, "daiban"), original = f.files.get(f.source.path);
  await f.service.execute(await f.service.prepare(task, [id(1)])); assert.equal(f.projects.detail(id(1)).total, 1); assert.equal(f.files.get(f.source.path), original);
  await f.service.execute(await f.service.prepare(await f.notes.read(task.path), [])); assert.equal(f.projects.detail(id(1)).ratio, null);
});
test("date/body/progress edit preserves unknown properties and rejects invalid dates", async () => {
  const f = await fixture("xiangmu"); await assert.rejects(f.projects.prepare(f.source, { ...input, end: "2026-10-09" }));
  await f.projects.execute(await f.projects.prepare(f.source, input)); const saved = f.index.find(id(1)); assert.equal(saved.body, input.body); assert.equal(saved.attributes.jindu, "jinxingzhong"); assert.equal(saved.attributes.kaishiriqi, "2026-10-10");
  await assert.rejects(f.projects.prepare(saved, { ...input, progress: "yiwancheng" }), /关闭按钮/);
});
test("unfinished closure rechecks new tasks; stale project and stopped/foreign requests cannot overwrite", async () => {
  const f = await fixture("xiangmu"), draft = await f.projects.prepare(f.source, input); await f.add(2, "daiban", { guanlian: [id(1)] });
  await assert.rejects(f.projects.prepare(f.source, { ...input, progress: "yiwancheng" }), /未完成/); const changed = await f.notes.update(f.source.version, { body: "手工新正文" }); await assert.rejects(f.projects.prepare(f.source, input), /变化/);
  await assert.rejects(f.projects.execute({ id: id(1) })); f.stop(); await assert.rejects(f.projects.execute(draft)); assert.equal(f.files.get(changed.path), changed.version.original);
});
test("uncertain project response retries one request, invalid/recycled tasks do not count", async () => {
  const f = await fixture("xiangmu"); await f.add(2, "daiban", { guanlian: [id(1)], yihuishou: true, huishoushijian: now });
  const draft = await f.projects.prepare(f.source, input), run = f.operations.run.bind(f.operations); let first = true;
  f.operations.run = async (req) => { const receipt = await run(req); if (first) { first = false; throw Error("uncertain"); } return receipt; };
  await assert.rejects(f.projects.execute(draft)); await Promise.all([f.projects.execute(draft), f.projects.execute(draft)]); assert.equal(f.projects.detail(id(1)).ratio, null); assert.equal(f.index.find(id(1)).body, input.body);
});
