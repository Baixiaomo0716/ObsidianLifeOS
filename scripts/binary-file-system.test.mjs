import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import * as esbuild from "esbuild";
class TFile { constructor(path) { this.path = path; } }
class TFolder { constructor(path) { this.path = path; } }
const b = await esbuild.build({ entryPoints: ["src/adapters/obsidian/binary-file-system.ts"], bundle: true, format: "cjs", platform: "browser", write: false, external: ["obsidian"] });
const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: () => ({ TFile, TFolder }) });
const { ObsidianBinaryFileSystem } = module.exports;
const path = "LifeOS/90_附件/项目/a/document.pdf";
function fixture() {
  const entries = new Map(), bytes = new Map(), calls = []; let active = true;
  const vault = { getAbstractFileByPath: (p) => entries.get(p), createFolder: async (p) => { calls.push("folder"); entries.set(p, new TFolder(p)); }, createBinary: async (p, data) => { calls.push("binary"); if (entries.has(p)) throw Error("exists"); entries.set(p, new TFile(p)); bytes.set(p, data.slice(0)); }, readBinary: async (file) => { calls.push("readBinary"); return bytes.get(file.path).slice(0); } };
  return { entries, bytes, calls, vault, fs: new ObsidianBinaryFileSystem(vault, () => active), stop: () => { active = false; } };
}
test("binary adapter uses public binary APIs and creates only matching real parent folders", async () => {
  const f = fixture(), data = new Uint8Array([0, 255]).buffer; await f.fs.create(path, data);
  assert.deepEqual([...new Uint8Array(await f.fs.read(path))], [0, 255]); assert.equal(f.calls.filter((name) => name === "binary").length, 1);
  assert.equal(f.calls.filter((name) => name === "folder").length, 4);
});
test("existing file, file as parent, and case alias cannot be overwritten", async () => {
  const f = fixture(); await f.fs.create(path, new ArrayBuffer(1)); await assert.rejects(f.fs.create(path, new ArrayBuffer(2)), (e) => e.code === "already_exists");
  await assert.rejects(f.fs.create(`${path}/a.pdf`, new ArrayBuffer(1)), (e) => e.code === "path");
  f.entries.set(path, new TFile("alias.pdf")); await assert.rejects(f.fs.read(path), (e) => e.code === "path"); assert.equal(f.bytes.get(path).byteLength, 1);
});
test("unsafe paths, missing files and stopped adapter produce no mutation", async () => {
  const f = fixture(); for (const p of ["../a.pdf", "C:/a.pdf", "/a.pdf", "LifeOS\\a.pdf"]) await assert.rejects(f.fs.create(p, new ArrayBuffer(1)), (e) => e.code === "path");
  await assert.rejects(f.fs.read(path), (e) => e.code === "not_found"); f.stop(); await assert.rejects(f.fs.create(path, new ArrayBuffer(1)), (e) => e.code === "inactive"); assert.equal(f.calls.length, 0);
});
test("folder races require real matching folders and createBinary races never overwrite", async () => {
  const f = fixture(), actual = f.vault.createFolder;
  f.vault.createFolder = async (p) => { await actual(p); throw Error("another caller created folder"); }; await f.fs.create(path, new ArrayBuffer(1));
  const next = fixture(); next.vault.createBinary = async (p) => { next.entries.set(p, new TFile(p)); next.bytes.set(p, new Uint8Array([9]).buffer); throw Error("race exists"); };
  await assert.rejects(next.fs.create(path, new ArrayBuffer(1)), (e) => e.code === "already_exists"); assert.deepEqual([...new Uint8Array(next.bytes.get(path))], [9]);
});
test("unload during folder creation prevents the subsequent binary write", async () => {
  const f = fixture(), actual = f.vault.createFolder; f.vault.createFolder = async (p) => { await actual(p); f.stop(); };
  await assert.rejects(f.fs.create(path, new ArrayBuffer(1)), (e) => e.code === "inactive"); assert.equal(f.bytes.size, 0);
});
