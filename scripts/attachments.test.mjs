import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/storage/attachment-store"; export * from "./src/services/attachment-reference-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", write: false, plugins: [mobileDependencyGuard()] });
const x = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString("base64")}`);
const id = (n) => `${String(n).padStart(8, "0")}-abcd-4abc-8abc-123456789abc`, now = "2026-10-10T00:00:00Z";
const buffer = (values = [1, 2, 3]) => Uint8Array.from(values).buffer;
const file = (name = "文档.pdf", values = [1, 2, 3]) => ({ name, type: "application/pdf", size: values.length, arrayBuffer: async () => buffer(values) });
function fixture(max = 10) {
  const files = new Map(), bytes = new Map(); let seq = 100, active = true, creates = 0;
  const missing = (p) => new x.StoreError("not_found", "missing", p), exists = (p) => new x.StoreError("already_exists", "exists", p);
  const fs = { list: async () => [...files.keys(), ...bytes.keys()], read: async (p) => { if (!files.has(p)) throw missing(p); return files.get(p); }, create: async (p, raw) => { if (files.has(p) || bytes.has(p)) throw exists(p); files.set(p, raw); }, process: async (p, fn) => { const raw = fn(await fs.read(p)); files.set(p, raw); return raw; } };
  const binary = { read: async (p) => { if (!bytes.has(p)) throw missing(p); return bytes.get(p).slice(0); }, create: async (p, value) => { if (files.has(p) || bytes.has(p)) throw exists(p); creates++; bytes.set(p, value.slice(0)); } };
  const layout = new x.StorageLayout(), clock = { now: () => now }, ids = { next: () => id(seq++) }, digest = { of: async (value) => createHash("sha256").update(new Uint8Array(value)).digest("hex") };
  const makeStore = () => new x.AttachmentStore(fs, binary, layout, clock, ids, digest, max, () => active), store = makeStore();
  const notes = new x.NoteStore(fs, layout, clock), ledger = new x.LedgerStore(fs, layout, clock), operations = new x.OperationService(fs, layout, notes, ledger, clock, ids, { get: async () => id(99) }, { of: async (text) => createHash("sha256").update(text).digest("hex") });
  const index = new x.EntityIndex(fs, layout), references = new x.AttachmentReferenceService(index, store, operations, ids, () => active);
  const project = async (n = 1, extra = {}) => notes.create(`${layout.module("xiangmu")}/项目${n}.md`, x.normalizeInput({ shiti: "xiangmu", biaoshi: id(n), jiegoubanben: 2, chuangjianshijian: now, gengxinshijian: now, mingcheng: `项目${n}`, daiban: [], shangchuanwenjian: [], unknown: { keep: true }, ...extra }), "项目正文\n");
  const metadata = (info) => `${layout.root}/00_系统/附件/${info.标识}.json`;
  return { files, bytes, fs, binary, store, makeStore, ids, index, references, notes, operations, project, metadata, stop: () => { active = false; }, creates: () => creates };
}
test("real copies with same original name keep extensions and distinct paths; metadata roundtrips", async () => {
  const f = fixture(), one = await f.store.prepare(file(), id(1)), two = await f.store.prepare(file(), id(1));
  const a = await f.store.execute(one), b = await f.store.execute(two); assert.notEqual(a.路径, b.路径); assert.ok(a.路径.endsWith(".pdf"));
  assert.equal(a.名称, "文档.pdf"); assert.equal(a.字节数, 3); assert.equal(a.类型, "application/pdf"); assert.equal(a.导入时间, now);
  assert.deepEqual(await f.store.read(a.标识), a); assert.deepEqual(await f.store.verifyPath(a.路径), a); assert.equal(f.creates(), 2);
});
test("size limits reject before loading; actual size mismatch and path traversal write nothing", async () => {
  const f = fixture(); let loaded = 0;
  await assert.rejects(f.store.prepare({ ...file(), size: 11, arrayBuffer: async () => { loaded++; return buffer(); } }, id(1))); assert.equal(loaded, 0);
  await assert.rejects(f.store.prepare({ ...file(), size: 1 }, id(1)));
  for (const name of ["../a.pdf", "a\\b.pdf", "a\n.pdf", ".", ".."]) await assert.rejects(f.store.prepare(file(name), id(1)));
  await assert.rejects(f.store.prepare(file(), "not-id")); assert.equal(f.files.size, 0); assert.equal(f.bytes.size, 0);
});
test("same in-flight request shares copy and uncertain binary receipt resumes without duplicate", async () => {
  const f = fixture(), actual = f.binary.create; let failed = false;
  f.binary.create = async (...args) => { await actual(...args); if (!failed) { failed = true; throw Error("lost receipt"); } };
  const draft = await f.store.prepare(file(), id(1)), one = f.store.execute(draft), two = f.store.execute(draft); assert.equal(one, two); await assert.rejects(one);
  await f.store.execute(draft); assert.equal(f.creates(), 1); assert.equal(f.bytes.size, 1);
});
test("metadata saved before uncertain response can be resumed after service recreation", async () => {
  const f = fixture(), actual = f.fs.create; let first = true;
  f.fs.create = async (...args) => { await actual(...args); if (first) { first = false; throw Error("lost metadata receipt"); } };
  const draft = await f.store.prepare(file(), id(1)); await assert.rejects(f.store.execute(draft)); assert.equal(f.bytes.size, 0);
  const fresh = f.makeStore(), resumed = await fresh.prepare(file(), id(1), draft.info.标识); await fresh.execute(resumed);
  assert.equal(resumed.info.导入时间, draft.info.导入时间); assert.equal(resumed.info.路径, draft.info.路径); assert.equal(f.creates(), 1);
  await assert.rejects(fresh.prepare(file("other.pdf"), id(1), draft.info.标识));
});
test("corrupted readback never reports success or overwrites partial bytes", async () => {
  const f = fixture(); f.binary.create = async (p) => { f.bytes.set(p, buffer([9])); };
  const draft = await f.store.prepare(file(), id(1)); await assert.rejects(f.store.execute(draft), /摘要/);
  await assert.rejects(f.store.execute(draft), /摘要/); assert.deepEqual([...new Uint8Array(f.bytes.get(draft.info.路径))], [9]);
});
test("preexisting target without matching import receipt is never adopted or overwritten", async () => {
  const f = fixture(), draft = await f.store.prepare(file(), id(1)); f.bytes.set(draft.info.路径, buffer());
  await assert.rejects(f.store.execute(draft), /认领/); assert.equal(f.files.size, 0); assert.equal(f.creates(), 0);
});
test("modified metadata, unsafe metadata paths and foreign draft remain read-only", async () => {
  const f = fixture(), draft = await f.store.prepare(file(), id(1)); await f.store.execute(draft);
  const p = f.metadata(draft.info), info = JSON.parse(f.files.get(p)); info.路径 = "../outside.pdf"; const raw = JSON.stringify(info); f.files.set(p, raw);
  await assert.rejects(f.store.read(draft.info.标识)); await assert.rejects(f.store.execute(draft)); await assert.rejects(f.store.execute({ info: draft.info }));
  assert.equal(f.files.get(p), raw); assert.equal(f.bytes.size, 1);
});
test("completed requests verify existing files and do not silently recreate later deleted data", async () => {
  const f = fixture(), draft = await f.store.prepare(file(), id(1)); await f.store.execute(draft); await f.store.execute(draft); assert.equal(f.creates(), 1);
  f.bytes.delete(draft.info.路径); await assert.rejects(f.store.execute(draft)); assert.equal(f.bytes.size, 0);
});
test("source bytes are captured independently, metadata immutable, original unsafe display name retained safely", async () => {
  const f = fixture(), data = buffer(), source = { ...file("方案:初稿.pdf"), arrayBuffer: async () => data };
  const draft = await f.store.prepare(source, id(1)); new Uint8Array(data)[0] = 99;
  assert.equal(draft.info.名称, "方案:初稿.pdf"); assert.ok(!draft.info.路径.includes(":")); assert.throws(() => { draft.info.路径 = "bad"; });
  await f.store.execute(draft); assert.deepEqual([...new Uint8Array(f.bytes.get(draft.info.路径))], [1, 2, 3]);
});
test("two projects can share verified attachment; unlink edits only one source and never deletes bytes", async () => {
  const f = fixture(), one = await f.project(1), two = await f.project(2), draft = await f.store.prepare(file(), id(1)); const info = await f.store.execute(draft);
  await f.references.execute(await f.references.prepare(one, [info.路径, info.路径])); await f.references.execute(await f.references.prepare(two, [info.路径]));
  const current = await f.notes.read(one.path); await f.references.execute(await f.references.prepare(current, []));
  assert.equal(f.bytes.size, 1); assert.equal(f.files.has(f.metadata(info)), true); assert.deepEqual((await f.notes.read(two.path)).attributes.shangchuanwenjian, [info.路径]);
  const after = await f.notes.read(one.path); assert.equal(after.body, one.body); assert.deepEqual(after.attributes.unknown, { keep: true });
});
test("new references require actual verified copies; old missing references can be retained and removed", async () => {
  const f = fixture(), project = await f.project(1, { shangchuanwenjian: ["LifeOS/90_附件/旧文件.pdf"] });
  await assert.rejects(f.references.prepare(project, ["LifeOS/90_附件/missing.pdf"]));
  await f.references.execute(await f.references.prepare(project, ["LifeOS/90_附件/旧文件.pdf"]));
  await f.references.execute(await f.references.prepare(await f.notes.read(project.path), []));
  assert.equal(f.bytes.size, 0); assert.deepEqual((await f.notes.read(project.path)).attributes.shangchuanwenjian, []);
});
test("source changed after attachment preparation cannot be overwritten; added file deletion is rechecked", async () => {
  const f = fixture(), project = await f.project(), imported = await f.store.execute(await f.store.prepare(file(), id(1))), draft = await f.references.prepare(project, [imported.路径]);
  await f.notes.update(project.version, { set: { neirong: "新内容" } }); await assert.rejects(f.references.execute(draft));
  assert.equal((await f.notes.read(project.path)).attributes.neirong, "新内容");
  const fresh = await f.notes.read(project.path), second = await f.references.prepare(fresh, [imported.路径]); f.bytes.delete(imported.路径);
  await assert.rejects(f.references.execute(second)); assert.deepEqual((await f.notes.read(project.path)).attributes.shangchuanwenjian, []);
});
test("uncertain reference completion retries original journal even if attachment subsequently disappears", async () => {
  const f = fixture(), project = await f.project(), imported = await f.store.execute(await f.store.prepare(file(), id(1)));
  const actual = f.operations.run.bind(f.operations); let calls = 0; f.operations.run = async (request) => { const receipt = await actual(request); if (++calls === 1) throw Error("uncertain"); return receipt; };
  const draft = await f.references.prepare(project, [imported.路径]); await assert.rejects(f.references.execute(draft)); f.bytes.delete(imported.路径); await f.references.execute(draft);
  assert.equal([...f.files.keys()].filter((p) => p.includes("/operations/")).length, 1); assert.deepEqual((await f.notes.read(project.path)).attributes.shangchuanwenjian, [imported.路径]);
});
test("retired plugin rejects preparation and execution without writes", async () => {
  const f = fixture(), draft = await f.store.prepare(file(), id(1)); f.stop();
  await assert.rejects(f.store.execute(draft)); await assert.rejects(f.store.prepare(file(), id(1))); assert.equal(f.files.size, 0); assert.equal(f.bytes.size, 0);
});
