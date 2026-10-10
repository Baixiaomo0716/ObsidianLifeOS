import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";
class TFile { constructor(path) { this.path = path; } }
class TFolder { constructor(path) { this.path = path; } }
const built = await esbuild.build({ stdin: { contents: 'export { ObsidianFileSystem } from "./src/adapters/obsidian/file-system"; export { StoreError } from "./src/domain/errors";', resolveDir: process.cwd() }, bundle: true, platform: "browser", format: "cjs", write: false, logLevel: "silent", plugins: [mobileDependencyGuard()] });
const module = { exports: {} };
vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports, require: (name) => { assert.equal(name, "obsidian"); return { TFile, TFolder }; }, console });
const { ObsidianFileSystem, StoreError } = module.exports;
class Vault {
  entries = new Map(); text = new Map(); calls = []; beforeProcess; failCreate; failFolder; folderRace;
  getAbstractFileByPath(path) { return this.entries.get(path) ?? null; }
  getFiles() { return [...this.entries.values()].filter((entry) => entry instanceof TFile); }
  async read(file) { this.calls.push(["read", file.path]); return this.text.get(file.path); }
  async createFolder(path) {
    this.calls.push(["createFolder", path]);
    if (this.failFolder) throw new Error("folder failed");
    this.entries.set(path, new TFolder(path));
    if (this.folderRace) throw new Error("already created by another caller");
  }
  async create(path, raw) {
    this.calls.push(["create", path]);
    if (this.failCreate) throw new Error("disk failed");
    if (this.entries.has(path)) throw new Error("exists");
    const file = new TFile(path);
    this.entries.set(path, file); this.text.set(path, raw); return file;
  }
  async process(file, transform) {
    this.calls.push(["process", file.path]);
    this.beforeProcess?.(file);
    const raw = transform(this.text.get(file.path));
    this.text.set(file.path, raw); return raw;
  }
}
const path = "LifeOS/80_知识/示例.md";
async function rejectsCode(promise, code) { await assert.rejects(promise, (error) => error.code === code); }
test("adapter creates parent folders and files through public Vault APIs", async () => {
  const vault = new Vault(), fs = new ObsidianFileSystem(vault);
  await fs.create(path, "示例正文");
  assert.deepEqual(vault.calls.map(([name]) => name), ["createFolder", "createFolder", "create"]);
  assert.equal(await fs.read(path), "示例正文");
  assert.deepEqual(Array.from(await fs.list()), [path]);
});
test("adapter uses fresh read and protected process, without cachedRead or modify", async () => {
  const vault = new Vault(), fs = new ObsidianFileSystem(vault);
  await fs.create(path, "旧正文");
  vault.beforeProcess = (file) => vault.text.set(file.path, "最新正文");
  const next = await fs.process(path, (current) => `${current}\n追加`);
  assert.equal(next, "最新正文\n追加");
  assert.equal(vault.calls.at(-1)[0], "process");
});
test("errors thrown inside process prevent writing and retain conflict code", async () => {
  const vault = new Vault(), fs = new ObsidianFileSystem(vault);
  await fs.create(path, "原文");
  await rejectsCode(fs.process(path, () => { throw new StoreError("conflict", "changed"); }), "conflict");
  assert.equal(vault.text.get(path), "原文");
});
test("adapter refuses existing files, folder-as-file and file-as-parent", async () => {
  const vault = new Vault(), fs = new ObsidianFileSystem(vault);
  await fs.create(path, "原文");
  await rejectsCode(fs.create(path, "覆盖"), "already_exists");
  await rejectsCode(fs.read("LifeOS/80_知识"), "path");
  await rejectsCode(fs.create(`${path}/子文件.md`, "文本"), "path");
  assert.equal(vault.text.get(path), "原文");
});
test("invalid paths are rejected before any host mutation", async () => {
  const vault = new Vault(), fs = new ObsidianFileSystem(vault);
  for (const bad of ["../escape.md", "C:/escape.md", "/escape.md", "LifeOS\\x.md"]) {
    await rejectsCode(fs.create(bad, "文本"), "path");
    await rejectsCode(fs.read(bad), "path");
    await rejectsCode(fs.process(bad, (raw) => raw), "path");
  }
  assert.equal(vault.calls.length, 0);
});
test("adapter distinguishes missing files and real IO errors", async () => {
  const vault = new Vault(), fs = new ObsidianFileSystem(vault);
  await rejectsCode(fs.read(path), "not_found");
  vault.failCreate = true;
  await rejectsCode(fs.create(path, "文本"), "io");
  assert.equal(vault.text.has(path), false);
});
test("folder creation races are accepted only when a real matching folder exists", async () => {
  const vault = new Vault(), fs = new ObsidianFileSystem(vault);
  vault.folderRace = true;
  await fs.create(path, "文本");
  assert.equal(await fs.read(path), "文本");
  const failedVault = new Vault(); failedVault.failFolder = true;
  await rejectsCode(new ObsidianFileSystem(failedVault).create(path, "文本"), "io");
  assert.equal(failedVault.text.size, 0);
});
test("case aliases from the host are not treated as the requested path", async () => {
  const vault = new Vault(), fs = new ObsidianFileSystem(vault);
  vault.entries.set(path, new TFile("LifeOS/80_知识/其他.md"));
  await rejectsCode(fs.read(path), "path");
});
test("unloaded plugin cannot start an operation or run a pending process callback", async () => {
  const vault = new Vault(); let active = true;
  const fs = new ObsidianFileSystem(vault, () => active);
  await fs.create(path, "原文");
  vault.beforeProcess = () => { active = false; };
  await rejectsCode(fs.process(path, () => "覆盖"), "inactive");
  assert.equal(vault.text.get(path), "原文");
  await rejectsCode(fs.read(path), "inactive");
  await rejectsCode(fs.create("LifeOS/80_知识/新.md", "文本"), "inactive");
  await rejectsCode(fs.list(), "inactive");
});
