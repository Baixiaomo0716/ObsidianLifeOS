import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", write: false });
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
  return { files, fs, index, notes, ledger, operations, ids, service, source, add, stop: () => { active = false; } };
}
test("cross-type multi selection deduplicates case insensitive IDs and saves only source references", async () => {
  const f = await fixture(); const book = await f.add(2, "zhishi"), row = await f.add(3, "jizhang");
  const beforeBook = f.files.get(book.path), beforeRow = f.files.get(row.path);
  const draft = await f.service.prepare(f.source, [id(2).toUpperCase(), id(2), id(3)]); assert.equal(draft.selected.length, 2);
  await f.service.execute(draft); const after = await f.notes.read(f.source.path);
  assert.deepEqual(after.attributes.guanlian, [id(2), id(3)]); assert.equal(after.body, f.source.body); assert.deepEqual(after.attributes.extra, { preserved: true });
  assert.equal(f.files.get(book.path), beforeBook); assert.equal(f.files.get(row.path), beforeRow);
});
test("unlink keeps target files and missing old references can be preserved or explicitly removed", async () => {
  const f = await fixture("riji", [id(88)]);
  await f.service.execute(await f.service.prepare(f.source, [id(88)]));
  const source = await f.notes.read(f.source.path), target = await f.add(2, "zhishi"), before = f.files.get(target.path);
  await f.service.execute(await f.service.prepare(source, []));
  assert.deepEqual((await f.notes.read(f.source.path)).attributes.guanlian, []); assert.equal(f.files.get(target.path), before);
});
test("self, missing additions and unsupported sources rejected before business writes", async () => {
  const f = await fixture(), before = [...f.files];
  for (const selection of [[id(1)], [id(8)], ["broken"]]) await assert.rejects(f.service.prepare(f.source, selection));
  const forged = { ...f.source, attributes: { ...f.source.attributes, guanlian: [id(8)] } };
  await assert.rejects(f.service.prepare(forged, [id(8)]));
  assert.deepEqual([...f.files], before);
  const other = await fixture("zhishi"); await assert.rejects(other.service.prepare(other.source, []));
});
test("task maximum one project and new closed project forbidden; existing closed project preserved", async () => {
  const f = await fixture("daiban"); await f.add(2, "xiangmu"); await f.add(3, "xiangmu"); await f.add(4, "xiangmu", { jindu: "yiwancheng", wanchengshijian: initial });
  await assert.rejects(f.service.prepare(f.source, [id(2), id(3)]), /最多/); await assert.rejects(f.service.prepare(f.source, [id(4)]), /关闭/);
  const existing = await fixture("daiban", [id(4)]); await existing.add(4, "xiangmu", { jindu: "yiwancheng", wanchengshijian: initial });
  await existing.service.execute(await existing.service.prepare(existing.source, [id(4)]));
});
test("stale sources both before preparation and after preparation cannot overwrite native edits", async () => {
  const f = await fixture(); const draft = await f.service.prepare(f.source, []);
  await f.notes.update(f.source.version, { set: { tianqi: "晴" } });
  await assert.rejects(f.service.prepare(f.source, []), /变化/); await assert.rejects(f.service.execute(draft));
  assert.equal((await f.notes.read(f.source.path)).attributes.tianqi, "晴");
});
test("target deleted or recycled after selection is rechecked before the first write", async () => {
  for (const recycled of [false, true]) {
    const f = await fixture(), target = await f.add(2, "zhishi"), draft = await f.service.prepare(f.source, [id(2)]);
    if (recycled) await f.notes.update(target.version, { set: { yihuishou: true, huishoushijian: now } }); else f.files.delete(target.path);
    await assert.rejects(f.service.execute(draft), /目标/); assert.deepEqual((await f.notes.read(f.source.path)).attributes.guanlian, []);
  }
});
test("concurrent repeat and uncertain completion retry use one journal request", async () => {
  const f = await fixture(); await f.add(2, "zhishi"); let calls = 0;
  const actual = f.operations.run.bind(f.operations); f.operations.run = async (request) => { calls++; const receipt = await actual(request); if (calls === 1) throw Error("uncertain receipt"); return receipt; };
  const draft = await f.service.prepare(f.source, [id(2)]);
  const one = f.service.execute(draft), two = f.service.execute(draft); assert.equal(one, two); await assert.rejects(one);
  f.files.delete((await f.index.find(id(2))).path); // Completed journal may still be acknowledged after target deletion.
  await f.service.execute(draft);
  assert.equal([...f.files.keys()].filter((p) => p.includes("/operations/") && p.endsWith(".json")).length, 1);
  assert.deepEqual((await f.notes.read(f.source.path)).attributes.guanlian, [id(2)]);
});
test("retired plugin and foreign drafts cannot write", async () => {
  const f = await fixture(); const draft = await f.service.prepare(f.source, []); f.stop();
  await assert.rejects(f.service.execute(draft)); await assert.rejects(f.service.execute({ selected: [] }));
});


