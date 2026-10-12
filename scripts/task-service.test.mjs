import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/task-service"; export * from "./src/services/journal-relation-service"; export * from "./src/services/journal-context-service"; export * from "./src/services/template-service"; export * from "./src/services/search-service"; export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
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
  return { tasks, creation, context, templates, files, fs, index, notes, ledger, operations, ids, service, source, add, stop: () => { active = false; } };
}

test("title alone creates Chinese task with pure filename and three-state list, cancelling preparation writes nothing", async () => {
  const f = await fixture("daiban"), before = [...f.files];
  await f.tasks.prepareCreate("取消创建"); assert.deepEqual([...f.files], before);
  const draft = await f.tasks.prepareCreate("整理书桌"), path = await f.tasks.executeCreate(draft);
  assert.equal(path.split("/").pop(), "整理书桌.md"); const raw = f.files.get(path);
  assert.match(raw, /进度:/); assert.match(raw, /未开始/); assert.equal((await f.notes.read(path)).attributes.jindu, "weikaishi");
  await f.tasks.executeCreate(draft); assert.equal([...f.files.keys()].filter((p) => p.endsWith("整理书桌.md")).length, 1);
});
test("complete, repeat, undo and in-progress preserve body, dates, relations, tags and unknown properties", async () => {
  const f = await fixture("daiban", [id(88)]);
  await f.tasks.execute(await f.tasks.prepare(f.source, "yiwancheng")); let source = await f.notes.read(f.source.path);
  assert.equal(source.attributes.wanchengshijian, now); const before = [...f.files];
  await f.tasks.execute(await f.tasks.prepare(source, "yiwancheng")); assert.deepEqual([...f.files], before);
  await f.tasks.execute(await f.tasks.prepare(source, "chexiaowancheng")); source = await f.notes.read(f.source.path);
  assert.equal(source.attributes.jindu, "weikaishi"); assert.equal(source.attributes.wanchengshijian, undefined);
  await f.tasks.execute(await f.tasks.prepare(source, "jinxingzhong")); source = await f.notes.read(f.source.path);
  assert.equal(source.attributes.jindu, "jinxingzhong"); assert.equal(source.body, f.source.body); assert.deepEqual(source.attributes.guanlian, [id(88)]); assert.deepEqual(source.attributes.extra, { preserved: true });
  await assert.rejects(f.tasks.prepare(source, "chexiaowancheng"));
});
test("cancel and restore are separate from progress, repeat cancellation retains timestamp and archive", async () => {
  const f = await fixture("daiban"), archived = await f.notes.update(f.source.version, { set: { yiguidang: true } });
  await f.tasks.execute(await f.tasks.prepare(archived, "quxiao")); let source = await f.notes.read(f.source.path);
  assert.equal(source.attributes.yiquxiao, true); assert.equal(source.attributes.quxiaoshijian, now); assert.equal(source.attributes.jindu, "weikaishi");
  const before = [...f.files]; await f.tasks.execute(await f.tasks.prepare(source, "quxiao")); assert.deepEqual([...f.files], before);
  await f.tasks.execute(await f.tasks.prepare(source, "jinxingzhong")); source = await f.notes.read(f.source.path); assert.equal(source.attributes.yiquxiao, true);
  await f.tasks.execute(await f.tasks.prepare(source, "huifuquxiao")); source = await f.notes.read(f.source.path);
  assert.equal(source.attributes.yiquxiao, false); assert.equal(source.attributes.quxiaoshijian, undefined); assert.equal(source.attributes.jindu, "jinxingzhong"); assert.equal(source.attributes.yiguidang, true);
});
test("markdown checkboxes do not control progress and original text remains exact", async () => {
  const f = await fixture("daiban"); const body = "- [x] 已勾选\n- [ ] 未勾选\n<!-- 私人注释 -->\n";
  const source = await f.notes.update(f.source.version, { body }); await f.index.rebuild();
  assert.equal(f.index.find(id(1)).attributes.jindu, "weikaishi");
  await f.tasks.execute(await f.tasks.prepare(source, "yiwancheng")); assert.equal((await f.notes.read(source.path)).body, body);
});
test("stale source before preparation or execution never overwrites native edits", async () => {
  const f = await fixture("daiban"), draft = await f.tasks.prepare(f.source, "yiwancheng");
  const changed = await f.notes.update(f.source.version, { body: "新正文" });
  await assert.rejects(f.tasks.prepare(f.source, "quxiao"), /变化/); await assert.rejects(f.tasks.execute(draft), /变化/);
  assert.equal(f.files.get(changed.path), changed.version.original);
});
test("uncertain completion and concurrent retry share same receipt without repeated completion time", async () => {
  const f = await fixture("daiban"), run = f.operations.run.bind(f.operations), requests = []; let first = true;
  f.operations.run = async (request) => { requests.push(request); const result = await run(request); if (first) { first = false; throw Error("uncertain"); } return result; };
  const draft = await f.tasks.prepare(f.source, "yiwancheng"); await assert.rejects(f.tasks.execute(draft));
  await Promise.all([f.tasks.execute(draft), f.tasks.execute(draft)]); assert.equal(requests.length, 2); assert.equal(requests[0], requests[1]);
  assert.equal((await f.notes.read(f.source.path)).attributes.wanchengshijian, now);
});
test("foreign, stopped, wrong-type and recycled tasks write nothing", async () => {
  const f = await fixture("daiban"), draft = await f.tasks.prepare(f.source, "quxiao"), before = [...f.files];
  await assert.rejects(f.tasks.execute({ action: "quxiao" })); await assert.rejects(f.tasks.prepare(f.source, "invalid")); f.stop(); await assert.rejects(f.tasks.execute(draft)); await assert.rejects(f.tasks.prepareCreate("停止")); assert.deepEqual([...f.files], before);
  const g = await fixture(); await assert.rejects(g.tasks.prepare(g.source, "yiwancheng"));
  const h = await fixture("daiban"), recycled = await h.notes.update(h.source.version, { set: { yihuishou: true, huishoushijian: now } }); await assert.rejects(h.tasks.prepare(recycled, "quxiao"));
});
test("invalid task dates are excluded and cannot transition", async () => {
  const f = await fixture("daiban"); const codec = new x.MarkdownCodec();
  f.files.set(f.source.path, codec.update(f.files.get(f.source.path), { ...f.source.attributes, kaishiriqi: "2026-10-12", jiezhiriqi: "2026-10-11" }, f.source.body));
  await f.index.rebuild(); assert.equal(f.index.find(id(1)), undefined); await assert.rejects(f.tasks.prepare(await f.notes.read(f.source.path), "yiwancheng"));
});
