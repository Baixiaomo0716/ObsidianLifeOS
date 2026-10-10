import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";
async function load(entry) {
  const result = await esbuild.build({ entryPoints: [entry], bundle: true, platform: "browser", format: "esm", write: false, logLevel: "silent", plugins: [mobileDependencyGuard()] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const s = await load("src/storage/index.ts"), d = await load("src/domain/index.ts");
// Disk-backed test double. This validates UTF-8 persistence, not Vault.process's
// real-host synchronization; the actual plugin uses ObsidianFileSystem instead.
class DiskFiles {
  constructor(root) { this.root = root; }
  target(relative) {
    s.safePath(relative);
    const target = path.resolve(this.root, relative);
    assert.ok(target.startsWith(this.root + path.sep));
    return target;
  }
  async list() {
    const walk = async (directory, prefix = "") => {
      const files = [];
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relative));
        else files.push(relative);
      }
      return files;
    };
    return walk(this.root);
  }
  async read(relative) { return readFile(this.target(relative), "utf8"); }
  async create(relative, raw) {
    const target = this.target(relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, raw, { encoding: "utf8", flag: "wx" });
  }
  async process(relative, transform) {
    const next = transform(await this.read(relative));
    await writeFile(this.target(relative), next, "utf8");
    return next;
  }
}
test("ten synthetic records persist as UTF-8 files and reread with new store instances", async () => {
  const base = path.resolve("tests/local-vault");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "DEV-006-roundtrip-"));
  assert.ok(root.startsWith(base + path.sep));
  const fs = new DiskFiles(root), layout = new s.StorageLayout();
  const now = "2026-10-09T14:00:00+08:00", later = "2026-10-10T14:00:00+08:00";
  const clock = { now: () => later };
  const notes = new s.NoteStore(fs, layout, clock), ledger = new s.LedgerStore(fs, layout, clock);
  const saved = [];
  for (const type of d.shiti) {
    const biaoshi = randomUUID();
    const input = d.deriveDateFields(d.normalizeInput({ biaoshi, shiti: type, jiegoubanben: 2, chuangjianshijian: now, gengxinshijian: now,
      ...(type === "riji" || type === "jizhang" ? { riqi: "2026-10-09" } : { mingcheng: "DEV-006测试😀" }),
      ...(type === "jizhang" ? { jine: 1250, fenlei: "测试分类" } : {}),
      legacy_custom: { number: 1.25, bool: false, nothing: null, list: ["冒号: '引号'", "😀"] } }));
    const relative = type === "jizhang" ? layout.ledgerPath(biaoshi) : `${layout.module(type)}/DEV-006测试😀.md`;
    const body = type === "jizhang" ? "" : "\r\n# 测试正文😀\r\n- [ ] 原生checkbox\r\n[[双链]]\n```\n---\n```\n";
    const store = type === "jizhang" ? ledger : notes;
    const snapshot = await store.create(relative, input, body);
    const updated = await store.update(snapshot.version, { set: type === "jizhang" ? { jine: 1299 } : type === "riji" ? { neirong: "属性: 第一行\n第二行😀" } : { mingcheng: "已更新😀" } });
    saved.push(updated);
    const bytes = await readFile(fs.target(relative));
    assert.equal(bytes.toString("utf8"), updated.version.original);
    assert.equal(updated.body, body);
  }
  const reopenedFiles = new DiskFiles(root);
  const reopenedNotes = new s.NoteStore(reopenedFiles, layout, clock), reopenedLedger = new s.LedgerStore(reopenedFiles, layout, clock);
  for (const snapshot of saved) {
    const store = snapshot.attributes.shiti === "jizhang" ? reopenedLedger : reopenedNotes;
    const reread = await store.read(snapshot.path);
    assert.equal(reread.validation.ok, true);
    assert.deepEqual(reread.attributes, snapshot.attributes);
    assert.equal(reread.body, snapshot.body);
    assert.equal(reread.version.original, snapshot.version.original);
  }
  assert.equal((await reopenedFiles.list()).length, 10);
});
