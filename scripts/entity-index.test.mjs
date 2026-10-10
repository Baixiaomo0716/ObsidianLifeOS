import assert from "node:assert/strict";
import { test } from "node:test";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";
const build = await esbuild.build({ stdin: { contents: 'export * from "./src/services/entity-index"; export * from "./src/storage/paths";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "browser", format: "esm", write: false, plugins: [mobileDependencyGuard()], logLevel: "silent" });
const { EntityIndex, StorageLayout } = await import(`data:text/javascript;base64,${Buffer.from(build.outputFiles[0].text).toString("base64")}`);
const id = "12345678-1234-4123-8123-123456789abc";
function fixture() {
  const files = new Map(), fs = { async list() { return [...files.keys()]; }, async read(path) { if (!files.has(path)) throw Error("missing"); return files.get(path); } };
  return { files, fs, index: new EntityIndex(fs, new StorageLayout()) };
}
const data = (extra = {}) => ({ biaoshi: id, shiti: "zhishi", jiegoubanben: 2, chuangjianshijian: "2026-10-09T06:00:00Z", gengxinshijian: "2026-10-09T06:00:00Z", mingcheng: "索引", biaoqian: [], ...extra });
const md = (record = data()) => `---\n${Object.entries(record).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n正文`;
const path = "LifeOS/80_知识/a.md";

test("subscriptions see published snapshots, release cleanly, and failing views do not block updates", async () => {
  const f = fixture(), observed = [];
  const release = f.index.subscribe(() => observed.push(f.index.all().length));
  f.index.subscribe(() => { throw Error("view failure"); });
  f.files.set(path, md()); await f.index.rebuild(); assert.deepEqual(observed, [1]);
  f.files.delete(path); await f.index.removed(path); assert.deepEqual(observed, [1, 0]);
  release(); f.files.set(path, md()); await f.index.changed(path); assert.deepEqual(observed, [1, 0]);
  f.index.stop(); assert.throws(() => f.index.subscribe(() => {}));
});
test("both authoritative sources indexed; system, templates, conflicts and recycled rows excluded", async () => {
  const f = fixture(); f.files.set(path, md());
  const rowId = "22345678-1234-4123-8123-123456789abc", rowPath = `LifeOS/20_记账/shuju/${rowId}.json`;
  f.files.set(rowPath, JSON.stringify(data({ biaoshi: rowId, shiti: "jizhang", riqi: "2026-10-09", xingqi: "星期五", shouzhi: "zhichu", fenlei: "测试", jine: 1250 })));
  for (const excluded of ["LifeOS/00_系统/模板/a.md", "LifeOS/99_回收与冲突/chongtu/a.md", "other/a.md", "LifeOS/90_附件/a.md"]) f.files.set(excluded, md());
  await f.index.rebuild(); assert.equal(f.index.all().length, 2);
  const row = JSON.parse(f.files.get(rowPath)); row.yihuishou = true; row.huishoushijian = "2026-10-09T06:00:00Z"; f.files.set(rowPath, JSON.stringify(row));
  await f.index.changed(rowPath); assert.equal(f.index.all().length, 1);
});
test("create modify delete and rename do not double count", async () => {
  const f = fixture(); await f.index.rebuild(); f.files.set(path, md()); await f.index.changed(path);
  f.files.set(path, md(data({ mingcheng: "修改" }))); await f.index.changed(path); assert.equal(f.index.find(id).attributes.mingcheng, "修改");
  const next = "LifeOS/80_知识/b.md"; f.files.set(next, f.files.get(path)); f.files.delete(path); await f.index.changed(next, path); assert.equal(f.index.all().length, 1);
  f.files.delete(next); await f.index.removed(next); assert.equal(f.index.all().length, 0);
});
test("duplicates exclude all contenders and recover after delete, case insensitive IDs", async () => {
  const f = fixture(); f.files.set(path, md()); const other = "LifeOS/80_知识/b.md"; f.files.set(other, md(data({ biaoshi: id.toUpperCase() })));
  await f.index.rebuild(); assert.equal(f.index.all().length, 0); assert.equal(f.index.issues().length, 2);
  f.files.delete(other); await f.index.removed(other); assert.equal(f.index.all().length, 1);
});
test("malformed and unsupported records reported without rewriting, later correction recovers", async () => {
  const f = fixture(); f.files.set(path, "bad yaml"); await f.index.rebuild(); assert.equal(f.index.issues().length, 1);
  f.files.set(path, md(data({ jiegoubanben: 99 }))); await f.index.changed(path); assert.equal(f.index.all().length, 0);
  f.files.set(path, md()); await f.index.changed(path); assert.equal(f.index.all().length, 1); assert.equal(f.index.issues().length, 0);
});
test("returned values cannot corrupt cache and cache is fully rebuildable", async () => {
  const f = fixture(); f.files.set(path, md()); await f.index.rebuild(); f.index.all()[0].attributes.mingcheng = "破坏";
  assert.equal(f.index.find(id).attributes.mingcheng, "索引"); const fresh = new EntityIndex(f.fs, new StorageLayout()); await fresh.rebuild(); assert.deepEqual(fresh.all(), f.index.all());
});
test("queued event during rebuild ends with fresh content and leaving root removes entry", async () => {
  const f = fixture(); f.files.set(path, md()); const rebuilding = f.index.rebuild(); f.files.set(path, md(data({ mingcheng: "最新" }))); const changing = f.index.changed(path); await Promise.all([rebuilding, changing]);
  assert.equal(f.index.find(id).attributes.mingcheng, "最新"); const outside = "outside/a.md"; f.files.set(outside, f.files.get(path)); f.files.delete(path); await f.index.changed(outside, path); assert.equal(f.index.all().length, 0);
});
test("failed enumeration retains prior published index; stopped in-flight rebuild cannot publish", async () => {
  const f = fixture(); f.files.set(path, md()); await f.index.rebuild(); f.fs.list = async () => { throw Error("io"); };
  await assert.rejects(f.index.rebuild()); assert.equal(f.index.all().length, 1);
  let release; f.fs.list = () => new Promise((resolve) => { release = resolve; }); const pending = f.index.rebuild(); await Promise.resolve(); f.index.stop(); release([path]); await assert.rejects(pending); assert.equal(f.index.initialized, false); assert.throws(() => f.index.all());
});
