import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/journal-relation-service"; export * from "./src/services/journal-context-service"; export * from "./src/services/template-service"; export * from "./src/services/search-service"; export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
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
  return { creation, context, templates, files, fs, index, notes, ledger, operations, ids, service, source, add, stop: () => { active = false; } };
}

test("prepare and cancel never write; unsupported ledger, self and invalid selection rejected", async () => {
  const f = await fixture(), before = [...f.files];
  await f.creation.prepare(f.source, [], "zhishi", "新知识");
  await assert.rejects(f.creation.prepare(f.source, [], "jizhang", "账本"));
  await assert.rejects(f.creation.prepare(f.source, [], "riji", "2026-10-09"));
  await assert.rejects(f.creation.prepare(f.source, [id(55)], "zhishi", "新知识"));
  assert.deepEqual([...f.files], before);
});
test("all nine templates create-return and preserve cross-type choices, body and unknown fields", async () => {
  for (const type of ["riji", "yuedu", "yingshi", "youxi", "yanchu", "lvxing", "zhishi", "daiban", "xiangmu"]) {
    const f = await fixture(); await f.add(2, "jizhang"); await f.add(3, "zhishi");
    const draft = await f.creation.prepare(f.source, [id(2), id(3)], type, type === "riji" ? "2026-10-11" : "新笔记");
    const result = await f.creation.execute(draft), saved = await f.notes.read(f.source.path);
    assert.deepEqual(result.selected, [id(2), id(3), result.id]); assert.equal(saved.body, f.source.body);
    assert.deepEqual(saved.attributes.extra, { preserved: true }); assert.equal(f.index.find(result.id).attributes.shiti, type);
  }
});
test("double submission and uncertain create retry use one note", async () => {
  const f = await fixture(), create = f.fs.create; let uncertain = true;
  f.fs.create = async (p, raw) => { await create(p, raw); if (p.endsWith("新笔记.md") && uncertain) { uncertain = false; throw new x.StoreError("io", "uncertain"); } };
  const draft = await f.creation.prepare(f.source, [], "zhishi", "新笔记");
  await assert.rejects(f.creation.execute(draft)); const [a, b] = await Promise.all([f.creation.execute(draft), f.creation.execute(draft)]);
  assert.equal(a.id, b.id); assert.equal([...f.files.keys()].filter((p) => p.endsWith("新笔记.md")).length, 1);
});
test("uncertain relation receipt retries same operation even after target deletion", async () => {
  const f = await fixture(), actual = f.service.execute.bind(f.service); let first = true;
  f.service.execute = async (draft) => { const result = await actual(draft); if (first) { first = false; throw Error("uncertain receipt"); } return result; };
  const draft = await f.creation.prepare(f.source, [], "zhishi", "新笔记"); await assert.rejects(f.creation.execute(draft));
  const saved = await f.notes.read(f.source.path), targetId = saved.attributes.guanlian[0]; f.files.delete(f.index.find(targetId).path);
  const result = await f.creation.execute(draft); assert.deepEqual(result.selected, [targetId]);
});
test("source edit after creation preserves both note and native edit and refuses overwrite", async () => {
  const f = await fixture(), actual = f.templates.execute.bind(f.templates);
  f.templates.execute = async (draft) => { const path = await actual(draft); await f.notes.update(f.source.version, { set: { tianqi: "晴" } }); return path; };
  const draft = await f.creation.prepare(f.source, [], "zhishi", "新笔记"); await assert.rejects(f.creation.execute(draft), /变化/);
  assert.equal((await f.notes.read(f.source.path)).attributes.tianqi, "晴"); assert.ok([...f.files.keys()].some((p) => p.endsWith("新笔记.md")));
  assert.deepEqual((await f.notes.read(f.source.path)).attributes.guanlian, []);
});
test("foreign and stopped requests never write", async () => {
  const f = await fixture(), draft = await f.creation.prepare(f.source, [], "zhishi", "新笔记"), before = [...f.files];
  await assert.rejects(f.creation.execute({ type: "zhishi" })); f.stop(); await assert.rejects(f.creation.execute(draft)); assert.deepEqual([...f.files], before);
});
test("automatic and explicit sections stay separate and money counts business date once", async () => {
  const f = await fixture("riji", [id(2), id(3), id(88)]);
  await f.add(2, "jizhang", { riqi: "2026-10-09", shouzhi: "zhichu", jine: 1250 });
  await f.add(3, "jizhang", { riqi: "2026-10-08", shouzhi: "shouru", jine: 3000, chuangjianshijian: "2026-10-08T16:30:00Z" });
  await f.index.rebuild(); const before = [...f.files], data = f.context.read("2026-10-09", id(1));
  assert.deepEqual(data.totals, { shouru: 0, zhichu: 1250, jieyu: -1250 }); assert.equal(data.explicit.length, 3);
  assert.deepEqual(data.explicit[2], { id: id(88) }); assert.equal(data.automatic.find((v) => v.id === id(2)).explicit, true);
  assert.deepEqual(data.automatic.find((v) => v.id === id(3)).reasons, ["当天新增"]); assert.deepEqual([...f.files], before);
});
test("business events honor timezone, travel range and exclude movie release dates", async () => {
  const f = await fixture();
  await f.add(2, "yingshi", { chuangjianshijian: "2026-10-01T00:00:00Z", guankanshijian: "2026-10-08T16:30:00Z" });
  await f.add(3, "yingshi", { chuangjianshijian: "2026-10-01T00:00:00Z", shangyingshijian: "2026-10-09" });
  await f.add(4, "lvxing", { chuangjianshijian: "2026-10-01T00:00:00Z", kaishiriqi: "2026-10-08", jieshuriqi: "2026-10-10" });
  await f.index.rebuild(); const data = f.context.read("2026-10-09");
  assert.ok(data.automatic.find((v) => v.id === id(2)).reasons.includes("观看")); assert.equal(data.automatic.some((v) => v.id === id(3)), false);
  assert.deepEqual(data.automatic.find((v) => v.id === id(4)).reasons, ["旅行日程"]);
});
test("disabled automatic types stay out while explicit references remain readable", async () => {
  const f = await fixture("riji", [id(2)]); await f.add(2, "zhishi"); await f.index.rebuild();
  const service = new x.JournalContextService(f.index, new x.SearchService(f.index, "Asia/Shanghai"), "Asia/Shanghai", ["riji"]);
  const data = service.read("2026-10-09", id(1)); assert.equal(data.automatic.length, 0); assert.equal(data.explicit[0].type, "zhishi");
});
test("invalid and recycled records excluded, not-ready distinct and overflow reported", async () => {
  const f = await fixture(); assert.equal(f.context.read("2026-10-09").ready, false); assert.throws(() => f.context.read("2026-02-30"));
  await f.add(2, "zhishi", { yihuishou: true, huishoushijian: now });
  await f.add(3, "jizhang", { shouzhi: "shouru", jine: Number.MAX_SAFE_INTEGER }); await f.add(4, "jizhang", { shouzhi: "shouru", jine: 1 });
  f.files.set("LifeOS/80_知识/损坏.md", "invalid");
  await f.index.rebuild(); const data = f.context.read("2026-10-09"); assert.equal(data.automatic.some((v) => v.id === id(2)), false); assert.ok(data.moneyError);
});
