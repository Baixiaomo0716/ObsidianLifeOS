import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";
const built = await esbuild.build({ stdin: { contents: 'export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index"; export * from "./src/adapters/browser/identity";', resolveDir: process.cwd() }, bundle: true, platform: "browser", format: "esm", write: false, logLevel: "silent", plugins: [mobileDependencyGuard()] });
const x = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const uuid = (n) => `${String(n).padStart(8, "0")}-9017-4db3-bc55-a0749d441ef2`;
const now = "2026-10-09T14:00:00+08:00", later = "2026-10-10T14:00:00+08:00", tomorrow = "2026-10-11T14:00:00+08:00";
const json = new x.JsonCodec(), md = new x.MarkdownCodec();
const layout = new x.StorageLayout();
const fingerprint = { of: async (text) => createHash("sha256").update(text).digest("hex") };

test("integrity reports missing targets and attachments without editing authoritative files", async () => {
  const s = setup(), action = createAction("daiban"); action.jilu.guanlian = [uuid(88)];
  await s.operations.run(request(action));
  const project = createAction("xiangmu", uuid(11)); project.jilu.shangchuanwenjian = ["LifeOS/90_附件/missing.pdf"];
  await s.operations.run(request(project, uuid(2)));
  const before = [...s.fs.files];
  const index = new x.EntityIndex(s.fs, layout), issues = await new x.IntegrityCheck(index, s.fs).run();
  assert.ok(issues.some((issue) => issue.code === "missing_reference")); assert.ok(issues.some((issue) => issue.code === "missing_attachment"));
  assert.deepEqual([...s.fs.files], before);
});
test("duplicate daily journals excluded until one is recycled; source files remain", async () => {
  const s = setup(), one = createAction("riji"), two = createAction("riji", uuid(11));
  await s.operations.run(request(one)); await s.operations.run(request(two, uuid(2)));
  const index = new x.EntityIndex(s.fs, layout); await index.rebuild();
  assert.equal(index.all().length, 0); assert.equal(index.issues().filter((issue) => issue.code === "duplicate_diary").length, 2);
  const trash = new x.TrashStore(index, { now: () => later });
  const edit = await trash.prepare(await s.notes.read(two.lujing), true); await s.operations.run(request(edit, uuid(3))); await index.rebuild();
  assert.equal(index.all().length, 1); assert.equal(s.fs.files.has(two.lujing), true);
});
test("MD logical recycle and restore preserve identity, body, unknown attributes and references", async () => {
  const s = setup(), action = createAction("daiban"); action.jilu.guanlian = [uuid(88)]; action.jilu.legacy_extra = { test: "保留" };
  await s.operations.run(request(action)); const index = new x.EntityIndex(s.fs, layout), trash = new x.TrashStore(index, { now: () => later });
  const before = await s.notes.read(action.lujing), recycle = await trash.prepare(before, true);
  await s.operations.run(request(recycle, uuid(2))); await s.operations.run(request(recycle, uuid(2))); await index.rebuild();
  assert.equal(index.all().length, 0); assert.equal((await trash.list()).length, 1);
  const recycled = await s.notes.read(action.lujing); assert.equal(recycled.body, before.body); assert.deepEqual(recycled.attributes.legacy_extra, before.attributes.legacy_extra);
  const restore = await trash.prepare(recycled, false); await s.operations.run(request(restore, uuid(3))); await index.rebuild();
  const after = index.find(uuid(10)); assert.ok(after); assert.deepEqual(after.attributes.guanlian, before.attributes.guanlian); assert.equal(after.attributes.huishoushijian, undefined);
});
test("JSON recycle restore excludes and reintroduces the same ledger row", async () => {
  const s = setup(), action = createAction("jizhang"); await s.operations.run(request(action));
  const index = new x.EntityIndex(s.fs, layout), trash = new x.TrashStore(index, { now: () => later });
  await s.operations.run(request(await trash.prepare(await s.ledger.read(action.lujing), true), uuid(2))); await index.rebuild(); assert.equal(index.all().length, 0);
  await s.operations.run(request(await trash.prepare(await s.ledger.read(action.lujing), false), uuid(3))); await index.rebuild();
  assert.equal(index.all().length, 1); assert.equal(index.find(uuid(10)).attributes.jine, 1250);
});
test("project referenced by active or recycled task cannot be recycled", async () => {
  const s = setup(), project = createAction("xiangmu"), task = createAction("daiban", uuid(11)); task.jilu.guanlian = [uuid(10)];
  await s.operations.run(request(project)); await s.operations.run(request(task, uuid(2)));
  const index = new x.EntityIndex(s.fs, layout), trash = new x.TrashStore(index, { now: () => later });
  await rejectsCode(trash.prepare(await s.notes.read(project.lujing), true), "validation");
  await s.operations.run(request(await trash.prepare(await s.notes.read(task.lujing), true), uuid(3)));
  await rejectsCode(trash.prepare(await s.notes.read(project.lujing), true), "validation");
});
test("recycling referenced ordinary entity keeps references; restoring repairs lookup", async () => {
  const s = setup(), note = createAction(), task = createAction("daiban", uuid(11)); task.jilu.guanlian = [uuid(10)];
  await s.operations.run(request(note)); await s.operations.run(request(task, uuid(2)));
  const index = new x.EntityIndex(s.fs, layout), trash = new x.TrashStore(index, { now: () => later }), integrity = new x.IntegrityCheck(index, s.fs);
  await s.operations.run(request(await trash.prepare(await s.notes.read(note.lujing), true), uuid(3)));
  assert.ok((await integrity.run()).some((issue) => issue.code === "missing_reference"));
  await s.operations.run(request(await trash.prepare(await s.notes.read(note.lujing), false), uuid(4)));
  assert.equal((await integrity.run()).length, 0);
});
test("stale recycle snapshot and source changes after preparation cannot overwrite", async () => {
  const s = setup(), action = createAction(); await s.operations.run(request(action));
  const index = new x.EntityIndex(s.fs, layout), trash = new x.TrashStore(index, { now: () => later });
  const snapshot = await s.notes.read(action.lujing), planned = await trash.prepare(snapshot, true);
  await s.notes.update(snapshot.version, { set: { neirong: "后续修改" } });
  await rejectsCode(trash.prepare(snapshot, true), "conflict"); await rejectsCode(s.operations.run(request(planned, uuid(2))), "conflict");
  assert.equal((await s.notes.read(action.lujing)).attributes.yihuishou, undefined);
});
test("recycle field validation applies to MD and project recycle refuses unreadable managed records", async () => {
  assert.equal(x.validateRecord(record("zhishi", uuid(10), { yihuishou: "yes" })).ok, false);
  assert.equal(x.validateRecord(record("zhishi", uuid(10), { yihuishou: true })).ok, false);
  const s = setup(), action = createAction("xiangmu"); await s.operations.run(request(action)); s.fs.files.set(`${layout.module("zhishi")}/bad.md`, "invalid");
  const index = new x.EntityIndex(s.fs, layout), trash = new x.TrashStore(index, { now: () => later });
  await rejectsCode(trash.prepare(await s.notes.read(action.lujing), true), "validation");
});

test("uncertain recycle write resumes original operation without altering timestamp or references", async () => {
  const s = setup(), action = createAction("daiban"); action.jilu.guanlian = [uuid(88)]; await s.operations.run(request(action));
  const index = new x.EntityIndex(s.fs, layout), trash = new x.TrashStore(index, { now: () => later });
  const prepared = request(await trash.prepare(await s.notes.read(action.lujing), true), uuid(2));
  s.fs.fault = { kind: "after-process", path: action.lujing }; await rejectsCode(s.operations.run(prepared), "io");
  const after = await s.notes.read(action.lujing); await setup(s.fs, { clock: { now: () => tomorrow } }).operations.resume(uuid(2));
  assert.equal((await s.notes.read(action.lujing)).version.original, after.version.original); assert.equal(after.attributes.huishoushijian, later);
});
test("multiple project memberships reported using resolved relations", async () => {
  const s = setup(); await s.operations.run(request(createAction("xiangmu"))); await s.operations.run(request(createAction("xiangmu", uuid(11)), uuid(2)));
  const task = createAction("daiban", uuid(12)); task.jilu.guanlian = [uuid(10), uuid(11)]; await s.operations.run(request(task, uuid(3)));
  const issues = await new x.IntegrityCheck(new x.EntityIndex(s.fs, layout), s.fs).run();
  assert.ok(issues.some((issue) => issue.code === "relation_validation"));
});
test("all ten types validate optional recycle metadata and reject malformed marks", () => {
  for (const type of x.shiti) {
    assert.equal(x.validateRecord(record(type, uuid(10), { yihuishou: true, huishoushijian: later })).ok, true, type);
    assert.equal(x.validateRecord(record(type, uuid(10), { yihuishou: false, huishoushijian: later })).ok, false, type);
  }
});
class Files {
  files = new Map(); calls = []; writes = []; fault; beforeProcess;
  async list() { return [...this.files.keys()]; }
  async read(path) { if (!this.files.has(path)) throw new x.StoreError("not_found", "missing", path); return this.files.get(path); }
  throws(kind, path) {
    if (this.fault?.kind === kind && this.fault.path === path) { this.fault = undefined; throw new x.StoreError("io", "injected IO", path); }
  }
  async create(path, raw) {
    this.calls.push(["create", path]); this.throws("create", path);
    if (this.files.has(path)) throw new x.StoreError("already_exists", "exists", path);
    this.files.set(path, raw); this.writes.push(["create", path]); this.throws("after-create", path);
  }
  async process(path, transform) {
    this.calls.push(["process", path]); this.beforeProcess?.(path); this.throws("process", path);
    const current = await this.read(path), next = transform(current);
    if (next !== current) { this.files.set(path, next); this.writes.push(["process", path]); }
    this.throws("after-process", path);
    return next;
  }
}
function setup(fs = new Files(), { deviceId = uuid(900), clock = { now: () => later } } = {}) {
  const notes = new x.NoteStore(fs, layout, clock), ledger = new x.LedgerStore(fs, layout, clock);
  let next = 1000, idCalls = 0;
  const ids = { next: () => { idCalls++; return uuid(next++); } };
  const operations = new x.OperationService(fs, layout, notes, ledger, clock, ids, { get: async () => deviceId }, fingerprint);
  return { fs, notes, ledger, operations, conflicts: new x.ConflictHandler(fs, layout, operations), idCalls: () => idCalls };
}
function record(type = "zhishi", id = uuid(10), patch = {}) {
  return x.deriveDateFields(x.normalizeInput({ biaoshi: id, shiti: type, jiegoubanben: 2, chuangjianshijian: now, gengxinshijian: now,
    ...(type === "riji" || type === "jizhang" ? { riqi: "2026-10-09" } : { mingcheng: "测试" }),
    ...(type === "jizhang" ? { fenlei: "餐饮", jine: 1250 } : {}), ...patch }));
}
function createAction(type = "zhishi", id = uuid(10)) {
  return { caozuoleixing: "chuangjian", lujing: type === "jizhang" ? layout.ledgerPath(id) : `${layout.module(type)}/${id}.md`, jilu: record(type, id), zhengwen: type === "jizhang" ? "" : "\r\n# 原文😀\r\n- [ ] 原生checkbox\n" };
}
function request(action, id = uuid(1)) { return { caozuobiaoshi: id, buzhou: Array.isArray(action) ? action : [action] }; }
async function rejectsCode(operation, code) { await assert.rejects(operation, (error) => error.code === code); }
function readLog(fs, id = uuid(1)) { return json.decode(fs.files.get(layout.operationPath(id))).attributes; }
function rewriteLog(fs, mutate, id = uuid(1)) { const log = readLog(fs, id); mutate(log); fs.files.set(layout.operationPath(id), json.create(log)); }

test("journal is persisted first, and repeated creates return the same receipt", async () => {
  for (const type of ["zhishi", "jizhang"]) {
    const t = setup(), action = createAction(type), req = request(action);
    const first = await t.operations.run(req);
    assert.equal(t.fs.writes[0][1], layout.operationPath(uuid(1)));
    const count = t.fs.writes.length;
    assert.deepEqual(await t.operations.run(req), first);
    assert.equal(t.fs.writes.length, count);
    assert.equal(t.fs.files.size, 2);
    assert.equal(readLog(t.fs).buzhou[0].jieguo, "yiwancheng");
  }
});
test("concurrent submits across service instances sharing a file port perform once", async () => {
  const t = setup(), second = setup(t.fs), req = request(createAction("jizhang"));
  const receipts = await Promise.all([t.operations.run(req), second.operations.run(req), t.operations.run(req)]);
  assert.deepEqual(receipts[0], receipts[1]);
  assert.equal(t.fs.writes.filter(([kind, p]) => kind === "create" && p === req.buzhou[0].lujing).length, 1);
});
test("same operation ID with a different amount, body or path is rejected", async () => {
  const t = setup(), action = createAction("jizhang"), req = request(action);
  await t.operations.run(req);
  await rejectsCode(t.operations.run(request({ ...action, jilu: { ...action.jilu, jine: 1200 } })), "operation_mismatch");
  await rejectsCode(t.operations.run(request({ ...action, zhengwen: "不同" })), "operation_mismatch");
  await rejectsCode(t.operations.run(request(createAction("jizhang", uuid(11)))), "operation_mismatch");
  assert.equal(json.decode(t.fs.files.get(action.lujing)).attributes.jine, 1250);
});
test("canonical fingerprints ignore object key ordering but preserve array order", async () => {
  const t = setup(), action = createAction();
  action.jilu.extra = { b: 2, a: 1 };
  await t.operations.run(request(action));
  const reordered = { ...action, jilu: Object.fromEntries(Object.entries(action.jilu).reverse()) };
  reordered.jilu.extra = { a: 1, b: 2 };
  await t.operations.run(request(reordered));
  assert.notEqual(x.canonical([1, 2]), x.canonical([2, 1]));
});
test("journal creation failure prevents all target writes", async () => {
  const t = setup(), action = createAction();
  t.fs.fault = { kind: "create", path: layout.operationPath(uuid(1)) };
  await rejectsCode(t.operations.run(request(action)), "io");
  assert.equal(t.fs.files.size, 0);
  await t.operations.run(request(action));
  assert.equal(t.fs.files.size, 2);
});
test("lost journal-create response is recoverable before target execution", async () => {
  const t = setup(), action = createAction();
  t.fs.fault = { kind: "after-create", path: layout.operationPath(uuid(1)) };
  await rejectsCode(t.operations.run(request(action)), "io");
  assert.equal(t.fs.files.has(action.lujing), false);
  await setup(t.fs).operations.resume(uuid(1));
  assert.equal(t.fs.files.size, 2);
});
test("write succeeds then response fails: restarting and retrying creates no new entity", async () => {
  const t = setup(), action = createAction("jizhang");
  t.fs.fault = { kind: "after-create", path: action.lujing };
  await rejectsCode(t.operations.run(request(action)), "io");
  const raw = t.fs.files.get(action.lujing);
  assert.equal(readLog(t.fs).buzhou[0].jieguo, "shibai");
  const receipt = await setup(t.fs, { clock: { now: () => tomorrow } }).operations.resume(uuid(1));
  assert.equal(receipt.buzhou[0].mubiaobiaoshi, action.jilu.biaoshi);
  assert.equal(t.fs.files.get(action.lujing), raw);
  assert.equal(t.fs.calls.filter(([kind, p]) => kind === "create" && p === action.lujing).length, 1);
});
test("target saved but completion-marker write fails: resume verifies existing content", async () => {
  const t = setup(), action = createAction();
  t.fs.fault = { kind: "process", path: layout.operationPath(uuid(1)) };
  await rejectsCode(t.operations.run(request(action)), "io");
  assert.equal(readLog(t.fs).buzhou[0].jieguo, "daizhixing");
  const raw = t.fs.files.get(action.lujing);
  await setup(t.fs).operations.resume(uuid(1));
  assert.equal(t.fs.files.get(action.lujing), raw);
  assert.equal(readLog(t.fs).buzhou[0].jieguo, "yiwancheng");
});
test("lost completion-marker response does not reset a completed step", async () => {
  const t = setup(), action = createAction();
  t.fs.fault = { kind: "after-process", path: layout.operationPath(uuid(1)) };
  await rejectsCode(t.operations.run(request(action)), "io");
  assert.equal(readLog(t.fs).buzhou[0].jieguo, "yiwancheng");
  const writes = t.fs.writes.length;
  await t.operations.resume(uuid(1));
  assert.equal(t.fs.writes.length, writes);
});
test("update loss after disk write preserves the original planned timestamp on retry", async () => {
  const t = setup(), action = createAction();
  const initial = await t.notes.create(action.lujing, action.jilu, action.zhengwen);
  const req = request({ caozuoleixing: "gengxin", banben: initial.version, xiugai: { set: { mingcheng: "新标题" } } });
  t.fs.fault = { kind: "after-process", path: action.lujing };
  await rejectsCode(t.operations.run(req), "io");
  const after = t.fs.files.get(action.lujing);
  await setup(t.fs, { clock: { now: () => tomorrow } }).operations.run(req);
  assert.equal(t.fs.files.get(action.lujing), after);
  assert.equal(md.decode(after).attributes.gengxinshijian, later);
});
test("a stale base version pauses operation and records conflict without overwriting", async () => {
  const t = setup(), action = createAction();
  const initial = await t.notes.create(action.lujing, action.jilu, action.zhengwen);
  const foreign = initial.version.original + "外部改动";
  t.fs.files.set(action.lujing, foreign);
  await rejectsCode(t.operations.run(request({ caozuoleixing: "gengxin", banben: initial.version, xiugai: { set: { mingcheng: "本地修改" } } })), "conflict");
  assert.equal(t.fs.files.get(action.lujing), foreign);
  assert.equal(readLog(t.fs).buzhou[0].jieguo, "chongtu");
});
test("externally changed target after uncertain save is never re-overwritten", async () => {
  const t = setup(), action = createAction();
  t.fs.fault = { kind: "after-create", path: action.lujing };
  await rejectsCode(t.operations.run(request(action)), "io");
  const changed = t.fs.files.get(action.lujing) + "用户后续改动";
  t.fs.files.set(action.lujing, changed);
  await rejectsCode(t.operations.resume(uuid(1)), "conflict");
  assert.equal(t.fs.files.get(action.lujing), changed);
});
test("batch partial failure does not execute project completion; resume skips completed steps", async () => {
  const t = setup(), actions = [createAction("daiban", uuid(10)), createAction("daiban", uuid(11)), createAction("xiangmu", uuid(12))];
  const snapshots = [];
  for (const action of actions) snapshots.push(await t.notes.create(action.lujing, action.jilu, action.zhengwen));
  const updates = snapshots.map((snapshot) => ({ caozuoleixing: "gengxin", banben: snapshot.version, xiugai: { set: { jindu: "yiwancheng", wanchengshijian: later } } }));
  t.fs.fault = { kind: "process", path: actions[1].lujing };
  await rejectsCode(t.operations.run(request(updates)), "io");
  assert.equal(md.decode(t.fs.files.get(actions[0].lujing)).attributes.jindu, "yiwancheng");
  assert.equal(md.decode(t.fs.files.get(actions[2].lujing)).attributes.jindu, "weikaishi");
  assert.deepEqual(readLog(t.fs).buzhou.map((step) => step.jieguo), ["yiwancheng", "shibai", "daizhixing"]);
  const firstWriteCount = t.fs.writes.filter(([, p]) => p === actions[0].lujing).length;
  await setup(t.fs).operations.resume(uuid(1));
  assert.equal(t.fs.writes.filter(([, p]) => p === actions[0].lujing).length, firstWriteCount);
  assert.equal(md.decode(t.fs.files.get(actions[2].lujing)).attributes.jindu, "yiwancheng");
});
test("created target survives relation failure and retry does not create it again", async () => {
  const t = setup(), journal = createAction("riji", uuid(20)), child = createAction("jizhang", uuid(21));
  const diary = await t.notes.create(journal.lujing, journal.jilu, journal.zhengwen);
  const req = request([child, { caozuoleixing: "gengxin", banben: diary.version, xiugai: { set: { guanlian: [child.jilu.biaoshi] } } }]);
  t.fs.fault = { kind: "process", path: journal.lujing };
  await rejectsCode(t.operations.run(req), "io");
  await setup(t.fs).operations.run(req);
  assert.equal(t.fs.calls.filter(([kind, p]) => kind === "create" && p === child.lujing).length, 1);
  assert.deepEqual(md.decode(t.fs.files.get(journal.lujing)).attributes.guanlian, [child.jilu.biaoshi]);
});
test("foreign incomplete operations are listed but never automatically taken over", async () => {
  const t = setup(), action = createAction();
  t.fs.fault = { kind: "create", path: action.lujing };
  await rejectsCode(t.operations.run(request(action)), "io");
  const foreign = setup(t.fs, { deviceId: uuid(901) }), before = new Map(t.fs.files);
  const pending = await foreign.operations.listPending();
  assert.equal(pending.daichuli.length, 1);
  assert.equal(pending.daichuli[0].shebeibiaoshi, uuid(900));
  await rejectsCode(foreign.operations.resume(uuid(1)), "foreign_operation");
  await rejectsCode(foreign.operations.run(request(action)), "foreign_operation");
  assert.deepEqual(t.fs.files, before);
});
test("completed foreign operations provide historical receipts without replaying writes", async () => {
  const t = setup(), action = createAction();
  const receipt = await t.operations.run(request(action));
  t.fs.files.delete(action.lujing);
  const before = new Map(t.fs.files);
  assert.deepEqual(await setup(t.fs, { deviceId: uuid(901) }).operations.resume(uuid(1)), receipt);
  assert.deepEqual(t.fs.files, before); // a historical receipt never recreates a deleted record
});
test("corrupt journal fingerprint and tampered target plan are rejected before replay", async () => {
  for (const mutate of [(log) => { log.qingqiuzhiwen = "0".repeat(64); }, (log) => { log.buzhou[0].mubiaoyuanwen += "篡改"; }]) {
    const t = setup(), action = createAction();
    t.fs.fault = { kind: "create", path: action.lujing };
    await rejectsCode(t.operations.run(request(action)), "io");
    rewriteLog(t.fs, mutate);
    await rejectsCode(t.operations.resume(uuid(1)), "operation_mismatch");
    assert.equal(t.fs.files.has(action.lujing), false);
  }
});
test("unknown log versions and malformed logs are reported without being overwritten", async () => {
  const t = setup(), action = createAction();
  t.fs.fault = { kind: "create", path: action.lujing };
  await rejectsCode(t.operations.run(request(action)), "io");
  rewriteLog(t.fs, (log) => { log.jiegoubanben = 3; });
  const raw = t.fs.files.get(layout.operationPath(uuid(1)));
  await rejectsCode(t.operations.resume(uuid(1)), "unsupported_version");
  assert.equal((await t.operations.listPending()).cuowu.length, 1);
  assert.equal(t.fs.files.get(layout.operationPath(uuid(1))), raw);
});
test("a concurrent journal edit is not overwritten by a completion marker", async () => {
  const t = setup(), action = createAction();
  t.fs.beforeProcess = (p) => { if (p === layout.operationPath(uuid(1))) { t.fs.files.set(p, t.fs.files.get(p) + " "); t.fs.beforeProcess = undefined; } };
  await rejectsCode(t.operations.run(request(action)), "conflict");
  assert.equal(readLog(t.fs).buzhou[0].jieguo, "daizhixing");
  await t.operations.resume(uuid(1));
  assert.equal(t.fs.calls.filter(([kind, p]) => kind === "create" && p === action.lujing).length, 1);
});
test("conflict copy has new identity, keeps mine and both source snapshots, and leaves source untouched", async () => {
  for (const type of ["zhishi", "jizhang"]) {
    const t = setup(), action = createAction(type), store = type === "jizhang" ? t.ledger : t.notes;
    action.jilu.legacy = { bool: false, nothing: null };
    const initial = await store.create(action.lujing, action.jilu, action.zhengwen);
    const current = initial.version.original + (type === "jizhang" ? " " : "他人的正文");
    t.fs.files.set(action.lujing, current);
    const edit = { set: type === "jizhang" ? { jine: 505 } : { mingcheng: "我的版本" } };
    const copy = await t.conflicts.capture(initial.version, edit);
    const receipt = await t.conflicts.saveCopy(uuid(1), copy);
    const p = receipt.buzhou[0].lujing, parsed = (type === "jizhang" ? json : md).decode(t.fs.files.get(p));
    assert.equal(t.fs.files.get(action.lujing), current);
    assert.notEqual(parsed.attributes.biaoshi, action.jilu.biaoshi);
    assert.equal(parsed.attributes.chuangjianshijian, later);
    assert.equal(parsed.attributes[type === "jizhang" ? "jine" : "mingcheng"], type === "jizhang" ? 505 : "我的版本");
    assert.deepEqual(parsed.attributes.legacy, action.jilu.legacy);
    assert.equal(parsed.body, action.zhengwen);
    assert.equal(layout.isManaged(p), false);
    const log = await t.operations.inspect(uuid(1));
    const stored = JSON.parse(log.qingqiu).buzhou[0];
    assert.equal(stored.banben.yuanwen, initial.version.original);
    assert.equal(stored.dangqianyuanwen, current);
    assert.deepEqual(await t.conflicts.saveCopy(uuid(1), copy), receipt);
    assert.equal(t.idCalls(), 1);
  }
});
test("lost conflict-copy response resumes with its original allocated UUID", async () => {
  const t = setup(), action = createAction(), initial = await t.notes.create(action.lujing, action.jilu, action.zhengwen);
  t.fs.files.set(action.lujing, initial.version.original + "别人改动");
  const copy = await t.conflicts.capture(initial.version, { set: { mingcheng: "我的修改" } });
  t.fs.fault = { kind: "after-create", path: layout.conflictPath(uuid(1000), "zhishi") };
  await rejectsCode(t.conflicts.saveCopy(uuid(1), copy), "io");
  const receipt = await setup(t.fs).operations.resume(uuid(1));
  assert.equal(receipt.buzhou[0].mubiaobiaoshi, uuid(1000));
  assert.equal(t.fs.calls.filter(([kind, p]) => kind === "create" && p === receipt.buzhou[0].lujing).length, 1);
});
test("unchanged source does not offer a conflict copy; missing operation stays explicit", async () => {
  const t = setup(), action = createAction(), initial = await t.notes.create(action.lujing, action.jilu, action.zhengwen);
  await rejectsCode(t.conflicts.capture(initial.version, { set: { mingcheng: "名字" } }), "validation");
  await rejectsCode(t.operations.resume(uuid(99)), "not_found");
});
test("invalid requests and duplicate batch paths write no journal", async () => {
  for (const actions of [[{ ...createAction("jizhang"), jilu: record("jizhang", uuid(10), { jine: 0 }) }], [createAction(), createAction()], [{ ...createAction(), lujing: "../escape.md" }]]) {
    const t = setup();
    await assert.rejects(t.operations.run(request(actions)));
    assert.equal(t.fs.files.size, 0);
  }
});
test("invalid operation identity and duplicate batch entity IDs are rejected before writes", async () => {
  const t = setup();
  for (const id of ["bad", undefined, 123]) {
    await rejectsCode(t.operations.run({ caozuobiaoshi: id, buzhou: [createAction()] }), "validation");
    await rejectsCode(t.operations.resume(id), "validation");
  }
  await rejectsCode(t.operations.run(request([createAction("zhishi"), createAction("jizhang")])), "validation");
  assert.equal(t.fs.files.size, 0);
});
test("completed steps cannot be forged ahead of an unfinished step", async () => {
  const t = setup(), actions = [createAction("zhishi", uuid(10)), createAction("jizhang", uuid(11))];
  t.fs.fault = { kind: "create", path: actions[0].lujing };
  await rejectsCode(t.operations.run(request(actions)), "io");
  rewriteLog(t.fs, (log) => { log.buzhou[1].jieguo = "yiwancheng"; });
  await rejectsCode(t.operations.resume(uuid(1)), "invalid_format");
  assert.equal(t.fs.files.has(actions[1].lujing), false);
});
test("unknown journal fields survive progress changes and inspect cannot mutate persisted plans", async () => {
  const t = setup(), action = createAction();
  t.fs.fault = { kind: "create", path: action.lujing };
  await rejectsCode(t.operations.run(request(action)), "io");
  rewriteLog(t.fs, (log) => { log.old_custom = { keep: [false, null] }; });
  const inspected = await t.operations.inspect(uuid(1));
  inspected.buzhou[0].mubiaoyuanwen = "caller mutation";
  await t.operations.resume(uuid(1));
  assert.deepEqual(readLog(t.fs).old_custom, { keep: [false, null] });
});
test("request is frozen before async hashing, including nested edit arrays", async () => {
  const t = setup(), action = createAction(), req = request(action);
  const pending = t.operations.run(req);
  action.jilu.mingcheng = "调用方之后改动";
  req.buzhou.push(createAction("jizhang", uuid(11)));
  await pending;
  assert.equal(readLog(t.fs).buzhou.length, 1);
  assert.equal(md.decode(t.fs.files.get(action.lujing)).attributes.mingcheng, "测试");
});
test("every persisted protocol key is pinyin; journals are excluded from entity indexing", async () => {
  const t = setup(); await t.operations.run(request(createAction()));
  const log = readLog(t.fs);
  for (const obj of [log, ...log.buzhou, JSON.parse(log.qingqiu), ...JSON.parse(log.qingqiu).buzhou]) assert.ok(Object.keys(obj).every((key) => /^[a-z]+$/.test(key)));
  assert.equal(layout.isManaged(layout.operationPath(uuid(1))), false);
});
test("browser UUID and SHA-256 adapters use native APIs and known hash vector", async () => {
  const ids = new x.BrowserIds(), generated = Array.from({ length: 20 }, () => ids.next());
  assert.ok(generated.every((id) => x.uuidV4.test(id)));
  assert.equal(new Set(generated).size, 20);
  assert.equal(await new x.BrowserFingerprint().of("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
test("device identity persists outside Vault and is not replaced if malformed", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), values = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  try {
    const first = await new x.BrowserDeviceIdentity(new x.BrowserIds()).get();
    assert.equal(await new x.BrowserDeviceIdentity(new x.BrowserIds()).get(), first);
    values.set("lifeos.shebeibiaoshi", "malformed");
    await rejectsCode(new x.BrowserDeviceIdentity(new x.BrowserIds()).get(), "invalid_format");
    assert.equal(values.get("lifeos.shebeibiaoshi"), "malformed");
  } finally { if (original) Object.defineProperty(globalThis, "localStorage", original); else delete globalThis.localStorage; }
});
test("missing browser crypto capability is reported without a weak fallback", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
  try {
    assert.throws(() => new x.BrowserIds().next(), (error) => error.code === "unsupported_capability");
    await rejectsCode(new x.BrowserFingerprint().of("abc"), "unsupported_capability");
  } finally { Object.defineProperty(globalThis, "crypto", original); }
});
test("real UTF-8 journal survives a new disk port and restores an uncertain write once", async () => {
  const base = path.resolve("tests/local-vault"); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "DEV-007-restart-"));
  assert.ok(root.startsWith(base + path.sep));
  class DiskFiles {
    writes = 0; loseResponse = true;
    target(relative) { x.safePath(relative); const target = path.resolve(root, relative); assert.ok(target.startsWith(root + path.sep)); return target; }
    async list() {
      const walk = async (directory, prefix = "") => {
        const results = [];
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) results.push(...await walk(path.join(directory, entry.name), relative)); else results.push(relative);
        }
        return results;
      };
      return walk(root);
    }
    async read(relative) {
      try { return await readFile(this.target(relative), "utf8"); }
      catch (error) { if (error.code === "ENOENT") throw new x.StoreError("not_found", "missing", relative); throw error; }
    }
    async create(relative, text) {
      const target = this.target(relative); await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, text, { encoding: "utf8", flag: "wx" }); this.writes++;
      if (layout.isManaged(relative) && this.loseResponse) { this.loseResponse = false; throw new x.StoreError("io", "lost disk response"); }
    }
    async process(relative, transform) { const next = transform(await this.read(relative)); await writeFile(this.target(relative), next, "utf8"); return next; }
  }
  const disk = new DiskFiles(), first = setup(disk), action = createAction("jizhang");
  await rejectsCode(first.operations.run(request(action)), "io");
  const raw = await disk.read(action.lujing);
  const restartedDisk = new DiskFiles(), restarted = setup(restartedDisk, { clock: { now: () => tomorrow } });
  const receipt = await restarted.operations.resume(uuid(1));
  assert.equal(receipt.buzhou[0].mubiaobiaoshi, action.jilu.biaoshi);
  assert.equal(await restartedDisk.read(action.lujing), raw);
  assert.equal(restartedDisk.writes, 0);
  assert.equal((await restarted.operations.inspect(uuid(1))).buzhou[0].jieguo, "yiwancheng");
});
