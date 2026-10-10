import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const b = await esbuild.build({ stdin: { contents: 'export * from "./src/services/journal-service"; export * from "./src/services/template-service"; export * from "./src/services/entity-index"; export * from "./src/services/operation-service"; export * from "./src/storage/index";', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", loader: { ".md": "text" }, write: false });
const x = await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].text).toString("base64")}`);
const id = (n) => `${String(n).padStart(8, "0")}-abcd-4abc-8abc-123456789abc`, now = "2026-10-09T16:30:00Z";
function fixture() {
  const files = new Map(); let n = 100, active = true;
  const fs = { list: async () => [...files.keys()], read: async (p) => { if (!files.has(p)) throw new x.StoreError("not_found", "missing"); return files.get(p); }, create: async (p, raw) => { if (files.has(p)) throw new x.StoreError("already_exists", "exists"); files.set(p, raw); }, process: async (p, fn) => { const raw = fn(await fs.read(p)); files.set(p, raw); return raw; } };
  const layout = new x.StorageLayout(), clock = { now: () => now }, ids = { next: () => id(n++) }, notes = new x.NoteStore(fs, layout, clock), ledger = new x.LedgerStore(fs, layout, clock), index = new x.EntityIndex(fs, layout);
  const operations = new x.OperationService(fs, layout, notes, ledger, clock, ids, { get: async () => id(1) }, { of: async (text) => createHash("sha256").update(text).digest("hex") });
  const templates = new x.TemplateService(fs, layout, index, operations, clock, ids, "Asia/Shanghai", ["riji"]), service = new x.JournalService(index, templates, clock, "Asia/Shanghai", () => active, layout.module("riji"));
  return { files, fs, notes, index, templates, service, stop: () => { active = false; } };
}
test("today uses configured timezone and month includes real leap days, rejecting malformed input", () => {
  const f = fixture(); assert.equal(f.service.today(), "2026-10-10"); assert.equal(f.service.month("2024-02").length, 29); assert.equal(f.service.month("2026-02").length, 28);
  assert.throws(() => f.service.month("2026-13")); assert.throws(() => f.service.day("2026-02-30"));
});
test("create and repeat open reuse one dated note and human month path", async () => {
  const f = fixture(), path = await f.service.execute(await f.service.prepare("2026-10-10")), before = [...f.files];
  assert.equal(path, "LifeOS/10_日记/2026-10/2026-10-10.md"); assert.equal(await f.service.execute(await f.service.prepare("2026-10-10")), path); assert.deepEqual([...f.files], before);
  assert.equal(f.service.day("2026-10-10").status, "ready");
});
test("native body and unknown properties survive browse/reopen; actual business date controls calendar", async () => {
  const f = fixture(), path = await f.service.execute(await f.service.prepare("2026-10-10")), codec = new x.MarkdownCodec(), before = codec.decode(f.files.get(path));
  const attrs = { ...before.attributes, tianqi: "晴", biaoqian: ["生活"], unknown: { keep: true } }, body = "# 手工正文\n<!-- 我的注释 -->\n";
  const raw = codec.update(f.files.get(path), attrs, body); f.files.set(path, raw); await f.index.changed(path);
  assert.equal(f.service.day("2026-10-10").body, body); assert.deepEqual(f.service.day("2026-10-10").tags, ["生活"]); assert.equal(f.service.day("2026-10-10").weather, "晴");
  await f.service.execute(await f.service.prepare("2026-10-10")); assert.equal(f.files.get(path), raw);
  const moved = "LifeOS/10_日记/其他月份/手工标题.md"; f.files.set(moved, raw); f.files.delete(path); await f.index.changed(moved, path);
  assert.equal(f.service.day("2026-10-10").paths[0], moved); assert.equal(await f.service.execute(await f.service.prepare("2026-10-10")), moved);
});
test("duplicate date records block creation, expose both originals, and never delete or merge", async () => {
  const f = fixture(), path = await f.service.execute(await f.service.prepare("2026-10-10")), codec = new x.MarkdownCodec(), decoded = codec.decode(f.files.get(path));
  f.files.set("LifeOS/10_日记/重复.md", codec.create({ ...decoded.attributes, biaoshi: id(9) }, "不同正文")); await f.index.rebuild(); const before = [...f.files];
  assert.equal(f.service.day("2026-10-10").status, "blocked"); assert.equal(f.service.day("2026-10-10").paths.length, 2); await assert.rejects(f.service.prepare("2026-10-10")); assert.deepEqual([...f.files], before);
});
test("unreadable dated journal blocks day but a similarly named unrelated note does not", async () => {
  const f = fixture(); f.files.set("LifeOS/80_知识/2026-10-10.md", "invalid"); await f.index.rebuild(); assert.equal(f.service.day("2026-10-10").status, "empty");
  f.files.set("LifeOS/10_日记/2026-10/2026-10-10.md", "invalid"); await f.index.rebuild(); assert.equal(f.service.day("2026-10-10").status, "blocked"); assert.equal(f.service.issueCount, 1); await assert.rejects(f.service.prepare("2026-10-10"));
});
test("recycled canonical journal is not overwritten and existing draft rechecks later disputes", async () => {
  const f = fixture(), path = await f.service.execute(await f.service.prepare("2026-10-10")), draft = await f.service.prepare("2026-10-10"), snapshot = await f.notes.read(path);
  await f.notes.update(snapshot.version, { set: { yihuishou: true, huishoushijian: now } }); await f.index.changed(path);
  assert.equal(f.service.day("2026-10-10").status, "blocked"); await assert.rejects(f.service.execute(draft)); await assert.rejects(f.service.prepare("2026-10-10"));
});
test("uncertain create response reuses identical request, concurrent new drafts cannot duplicate a day", async () => {
  const f = fixture(), actual = f.fs.create; let first = true;
  f.fs.create = async (p, raw) => { await actual(p, raw); if (p.endsWith(".md") && first) { first = false; throw new x.StoreError("io", "uncertain"); } };
  const draft = await f.service.prepare("2026-10-10"); await assert.rejects(f.service.execute(draft)); await f.service.execute(draft);
  const [a, b] = await Promise.all([f.service.prepare("2026-10-11"), f.service.prepare("2026-10-11")]); assert.deepEqual(await Promise.all([f.service.execute(a), f.service.execute(b)]), ["LifeOS/10_日记/2026-10/2026-10-11.md", "LifeOS/10_日记/2026-10/2026-10-11.md"]);
  assert.equal([...f.files.keys()].filter((p) => p.endsWith(".md")).length, 2);
});
test("unloaded service and foreign drafts write nothing", async () => {
  const f = fixture(); const draft = await f.service.prepare("2026-10-10"); f.stop(); await assert.rejects(f.service.execute(draft)); await assert.rejects(f.service.prepare("2026-10-11")); assert.equal(f.files.size, 0);
  const other = fixture(); await assert.rejects(other.service.execute({ date: "2026-10-10" }));
});
