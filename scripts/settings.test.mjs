import assert from "node:assert/strict";
import { test } from "node:test";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";
const result = await esbuild.build({ stdin: { contents: 'export * from "./src/settings/settings-store"; export * from "./src/storage/index";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "browser", format: "esm", write: false, plugins: [mobileDependencyGuard()], logLevel: "silent" });
const x = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
class Files {
  files = new Map();
  async read(path) { if (!this.files.has(path)) throw new x.StoreError("not_found", "missing"); return this.files.get(path); }
  async create(path, raw) { if (this.files.has(path)) throw new x.StoreError("already_exists", "exists"); this.files.set(path, raw); }
  async process(path, change) { const next = change(await this.read(path)); this.files.set(path, next); return next; }
}
const setup = () => { const fs = new Files(); return { fs, store: new x.SettingsStore(fs) }; };
test("missing settings use fresh defaults without writes", async () => {
  const { fs, store } = setup(), one = await store.read(); assert.equal(one.yuanwen, null); assert.equal(fs.files.size, 0);
  one.shuju.mulu.riji = "改变"; assert.equal((await store.read()).shuju.mulu.riji, "10_日记");
});
test("explicit save persists pinyin schema and new store reloads complete settings", async () => {
  const { fs, store } = setup(); const saved = await store.save(await store.read(), { genmulu: "我的生活", shiqu: "UTC", qiyongmokuai: ["jizhang"] });
  assert.deepEqual((await new x.SettingsStore(fs).read()).shuju, saved.shuju);
  const keys = Object.keys(JSON.parse(fs.files.get(x.settingsPath))); assert.ok(keys.every((key) => /^[a-z]+$/.test(key)));
});
test("unsafe or reserved roots, overlapping module folders and invalid enabled lists rejected", () => {
  for (const root of ["../data", "C:/data", "LifeOS配置", "LifeOS验收/sub", "x\\y"]) assert.throws(() => x.validateSettings({ ...x.defaultSettings(), genmulu: root }));
  const settings = x.defaultSettings(); settings.mulu.jizhang = settings.mulu.riji + "/sub"; assert.throws(() => x.validateSettings(settings));
  for (const list of [["unknown"], ["riji", "riji"]]) assert.throws(() => x.validateSettings({ ...x.defaultSettings(), qiyongmokuai: list }));
});
test("timezone and positive safe integer byte limit validated", () => {
  assert.throws(() => x.validateSettings({ ...x.defaultSettings(), shiqu: "Mars/Invalid" }));
  for (const size of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "20"]) assert.throws(() => x.validateSettings({ ...x.defaultSettings(), fujianzuidadaxiao: size }));
});
test("same category name allowed between income expense, duplicates within one kind rejected", () => {
  const one = { shouzhi: "shouru", fenlei: "其他", qiyong: true };
  assert.equal(x.validateSettings({ ...x.defaultSettings(), fenlei: [one, { ...one, shouzhi: "zhichu" }] }).fenlei.length, 2);
  assert.throws(() => x.validateSettings({ ...x.defaultSettings(), fenlei: [one, one] }));
  assert.throws(() => x.validateSettings({ ...x.defaultSettings(), fenlei: [{ ...one, fenlei: " " }] }));
});
test("renaming or disabling a category only changes options, not historical ledger rows", async () => {
  const { fs, store } = setup(); fs.files.set("LifeOS/20_记账/shuju/history.json", '{"fenlei":"餐饮","shouzhi":"zhichu","jine":1250}');
  const snapshot = await store.read(); snapshot.shuju.fenlei[1].fenlei = "饮食"; snapshot.shuju.fenlei[1].qiyong = false;
  const saved = await store.save(snapshot, { fenlei: snapshot.shuju.fenlei });
  assert.ok(!x.activeCategories(saved.shuju, "zhichu").includes("饮食")); assert.equal(fs.files.get("LifeOS/20_记账/shuju/history.json"), '{"fenlei":"餐饮","shouzhi":"zhichu","jine":1250}');
});
test("unknown root and category metadata preserved; identity version and unknown patch rejected", async () => {
  const { fs, store } = setup(), settings = x.defaultSettings(); settings.legacy_extra = { list: [1, null, true] }; settings.fenlei[0].legacy = "保留";
  fs.files.set(x.settingsPath, JSON.stringify(settings)); const saved = await store.save(await store.read(), { shiqu: "UTC" });
  assert.deepEqual(saved.shuju.legacy_extra, settings.legacy_extra); assert.equal(saved.shuju.fenlei[0].legacy, "保留");
  await assert.rejects(store.save(saved, { legacy_extra: "覆盖" })); await assert.rejects(store.save(saved, { jiegoubanben: 99 }));
});
test("malformed duplicate-key and unknown-version configs never fall back or overwrite", async () => {
  const { fs, store } = setup(); for (const raw of ["bad", '{"jiegoubanben":2,"jiegoubanben":2}', JSON.stringify({ ...x.defaultSettings(), jiegoubanben: 99 })]) {
    fs.files.set(x.settingsPath, raw); await assert.rejects(store.read()); assert.equal(fs.files.get(x.settingsPath), raw);
  }
});
test("stale full-text settings snapshot cannot overwrite concurrent edit", async () => {
  const { fs, store } = setup(); await store.save(await store.read(), {}); const snapshot = await store.read(); const raw = snapshot.yuanwen + "\n"; fs.files.set(x.settingsPath, raw);
  await assert.rejects(store.save(snapshot, { shiqu: "UTC" }), (error) => error.code === "conflict"); assert.equal(fs.files.get(x.settingsPath), raw);
});
test("concurrent first saves cannot overwrite existing configuration", async () => {
  const { fs, store } = setup(); const a = await store.read(), b = await store.read(); await store.save(a, { shiqu: "UTC" });
  await assert.rejects(store.save(b, { shiqu: "Asia/Shanghai" }), (error) => error.code === "already_exists"); assert.equal((await store.read()).shuju.shiqu, "UTC"); assert.equal(fs.files.size, 1);
});
test("save captures draft before awaiting filesystem writes", async () => {
  const { fs, store } = setup(); const patch = { fenlei: [{ shouzhi: "shouru", fenlei: "原分类", qiyong: true }] }; let release;
  fs.create = (path, raw) => new Promise((resolve) => { release = () => { fs.files.set(path, raw); resolve(); }; });
  const saving = store.save(await store.read(), patch); patch.fenlei[0].fenlei = "篡改"; release(); await saving;
  assert.equal((await store.read()).shuju.fenlei[0].fenlei, "原分类");
});
