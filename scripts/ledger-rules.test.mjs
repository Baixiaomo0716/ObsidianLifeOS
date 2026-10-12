import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/ledger-rules"; export * from "./src/services/ledger-service"; export * from "./src/settings/settings-store"; export * from "./src/services/task-service"; export * from "./src/services/journal-relation-service"; export * from "./src/services/journal-context-service"; export * from "./src/services/template-service"; export * from "./src/services/search-service"; export * from "./src/services/relation-service"; export * from "./src/services/index"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
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

test("exact minimum, maximum and decimal representations roundtrip without floating point", () => {
  for (const [yuan, fen] of [["0.01", 1], ["0.10", 10], ["1.2", 120], ["0001.20", 120], [" 12.50 ", 1250], ["90071992547409.91", Number.MAX_SAFE_INTEGER]]) {
    assert.equal(x.yuanToFen(yuan), fen); assert.equal(x.yuanToFen(x.fenToYuan(fen)), fen);
  }
  for (const value of [12.5, null, "0.001", "90071992547409.92", "1,000", "￥1", "+1", ".5", "1.", "１２", "NaN", "0.00"]) assert.throws(() => x.yuanToFen(value));
});
test("cumulative overflow rejected; net can be negative and recycled rows do not count", () => {
  assert.deepEqual(x.jizhangHuizong([{ shouzhi: "zhichu", jine: 1 }, { shouzhi: "shouru", jine: 100, yihuishou: true }]), { shouru: 0, zhichu: 1, jieyu: -1 });
  for (const shouzhi of ["shouru", "zhichu"]) assert.throws(() => x.jizhangHuizong([{ shouzhi, jine: Number.MAX_SAFE_INTEGER }, { shouzhi, jine: 1 }]));
  assert.throws(() => x.jizhangHuizong([{ shouzhi: "zhuanzhang", jine: 100 }]));
});
test("unchanged stopped or removed historical category allowed, new assignment and changed kind forbidden", () => {
  const settings = x.defaultSettings(), old = { shouzhi: "zhichu", fenlei: "历史餐饮" };
  x.assertLedgerCategory(settings, old, old); assert.throws(() => x.assertLedgerCategory(settings, old));
  assert.throws(() => x.assertLedgerCategory(settings, { ...old, shouzhi: "shouru" }, old));
  x.assertLedgerCategory(settings, { shouzhi: "zhichu", fenlei: "餐饮" }, old);
  settings.fenlei.find((v) => v.fenlei === "餐饮").qiyong = false;
  assert.throws(() => x.assertLedgerCategory(settings, { shouzhi: "zhichu", fenlei: "餐饮" }, old));
  assert.throws(() => x.assertLedgerCategory(settings, { shouzhi: "zhuanzhang", fenlei: "转账" }, { shouzhi: "zhuanzhang", fenlei: "转账" }));
});
test("category disabling leaves historical JSON queryable and unchanged", async () => {
  const f = await fixture(), draft = f.entry.prepare({ date: "2026-10-10", kind: "zhichu", category: "餐饮", amount: "1", tags: [] }); await f.entry.execute(draft);
  const row = f.index.find(draft.id), raw = f.files.get(row.path); f.settings.fenlei = []; await f.index.rebuild();
  assert.equal(f.index.find(draft.id).attributes.fenlei, "餐饮"); assert.equal(f.files.get(row.path), raw);
  assert.equal(new x.SearchService(f.index, "Asia/Shanghai").query({ type: "jizhang" }).total, 1);
});
test("old transfer and refund rows remain originals and cannot enter normal index or totals", async () => {
  for (const oldKind of ["转账", "退款"]) {
    const f = await fixture(), row = await f.add(9, "jizhang"), raw = JSON.parse(f.files.get(row.path)); raw.收支 = oldKind;
    const old = JSON.stringify(raw); f.files.set(row.path, old); await f.index.rebuild();
    assert.equal(f.index.find(id(9)), undefined); assert.ok(f.index.issues().some((v) => v.path === row.path));
    assert.equal(f.files.get(row.path), old); assert.equal(new x.SearchService(f.index, "Asia/Shanghai").query({ type: "jizhang" }).total, 0);
  }
});
test("uncertain successful save still recovers its receipt after category is disabled", async () => {
  const f = await fixture(), draft = f.entry.prepare({ date: "2026-10-10", kind: "zhichu", category: "餐饮", amount: "1", tags: [] }), run = f.operations.run.bind(f.operations); let first = true;
  f.operations.run = async (req) => { const result = await run(req); if (first) { first = false; throw Error("uncertain"); } return result; };
  await assert.rejects(f.entry.execute(draft)); f.settings.fenlei = []; await f.entry.execute(draft);
  assert.equal(f.index.all().filter((v) => v.attributes.shiti === "jizhang").length, 1);
});
