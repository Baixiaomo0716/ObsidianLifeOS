import assert from "node:assert/strict";
import { test } from "node:test";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";
async function module(path) {
  const result = await esbuild.build({ entryPoints: [path], bundle: true, platform: "browser", format: "esm", write: false, logLevel: "silent", plugins: [mobileDependencyGuard()] });
  assert.ok(result.outputFiles[0]);
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const s = await module("src/storage/index.ts");
const d = await module("src/domain/index.ts");
const id = "7184687e-9017-4db3-bc55-a0749d441ef2";
const other = "9184687e-9017-4db3-bc55-a0749d441ef2";
const now = "2026-10-09T14:00:00+08:00", later = "2026-10-10T14:00:00+08:00";
const layout = new s.StorageLayout();
const md = new s.MarkdownCodec(), json = new s.JsonCodec();
function record(type, patch = {}) {
  return d.deriveDateFields(d.normalizeInput({ biaoshi: id, shiti: type, jiegoubanben: 2, chuangjianshijian: now, gengxinshijian: now,
    ...(type === "riji" || type === "jizhang" ? { riqi: "2026-10-09" } : { mingcheng: "测试" }),
    ...(type === "jizhang" ? { fenlei: "餐饮", jine: 1250 } : {}), ...patch }));
}
function path(type, name = "测试") { return type === "jizhang" ? layout.ledgerPath(id) : `${layout.module(type)}/${name}.md`; }
const body = "\n# 原生正文\r\n- [ ] 保留待办\r\n[[双链]] ![[附件.pdf]]\n```yaml\n---\n代码: '不解析'\n```\n";
class MemoryFiles {
  files = new Map(); calls = []; beforeProcess; beforeList; fail;
  async list() { if (this.beforeList) await this.beforeList(); return [...this.files.keys()]; }
  async read(path) { if (!this.files.has(path)) throw new s.StoreError("not_found", "missing", path); return this.files.get(path); }
  async create(path, raw) {
    this.calls.push(["create", path]);
    if (this.files.has(path)) throw new s.StoreError("already_exists", "exists", path);
    if (this.fail === "create") throw new Error("disk error");
    this.files.set(path, raw);
    if (this.fail === "after-create") throw new Error("lost response");
  }
  async process(path, transform) {
    this.calls.push(["process", path]);
    if (this.beforeProcess) this.beforeProcess(path);
    if (this.fail === "process") throw new Error("write error");
    const current = await this.read(path);
    const next = transform(current);
    if (next !== current) this.files.set(path, next);
    return next;
  }
}
function stores(fs = new MemoryFiles(), clock = { now: () => later }) {
  return { fs, notes: new s.NoteStore(fs, layout, clock), ledger: new s.LedgerStore(fs, layout, clock) };
}
async function rejectsCode(operation, code) {
  await assert.rejects(operation, (error) => error.code === code, `expected ${code}`);
}
function throwsCode(operation, code) { assert.throws(operation, (error) => error.code === code); }

test("all nine Markdown entities and ledger JSON can be created and reread", async () => {
  for (const type of d.shiti) {
    const { fs, notes, ledger } = stores();
    const store = type === "jizhang" ? ledger : notes;
    const snapshot = await store.create(path(type), record(type), type === "jizhang" ? "" : body);
    assert.equal(snapshot.validation.ok, true);
    const reread = await store.read(path(type));
    assert.deepEqual(reread.attributes, record(type));
    assert.equal(reread.body, type === "jizhang" ? "" : body);
    assert.equal(fs.files.size, 1);
    assert.equal([...fs.files.keys()][0].endsWith(type === "jizhang" ? ".json" : ".md"), true);
  }
});
test("YAML attributes preserve multiline content, whitespace, quotes and scalar-like strings", () => {
  for (const content of ["冒号: 引号\" ' # \n第二行😀\n", "  首尾空格  ", "\n起始\n\n结尾\n\n", "字\r\n第二行\r\n", "false", "null", "0012", "2026-10-09", "```\n---\n```", "制表\t控制\u0001符"]) {
    const attributes = record("zhishi", { neirong: content });
    const encoded = md.create(attributes, body);
    assert.deepEqual(md.decode(encoded), { attributes, body });
  }
});
test("YAML preserves unknown nested types and comments when changing one field", () => {
  const original = md.create(record("zhishi"), body).replace('名称: "测试"', '# 标题注释\n名称: "测试" # 行尾注释');
  const raw = original.replace("---\n\n# 原生正文", "unknown_boolean: false\nunknown_null: null\nunknown_number: 3.25\nunknown_text: \"false\"\nunknown_object: {list: [1, true, null, \"文字\"], inner: {x: 2}}\nunknown_date: 2026-10-09\n---\n\n# 原生正文");
  const decoded = md.decode(raw);
  assert.equal(decoded.attributes.unknown_date, "2026-10-09");
  const next = md.update(raw, { ...decoded.attributes, mingcheng: "新名称" }, decoded.body);
  assert.deepEqual(md.decode(next).attributes, { ...decoded.attributes, mingcheng: "新名称" });
  assert.equal(md.decode(next).body, body);
  assert.ok(next.includes("# 标题注释"));
  assert.ok(next.includes("unknown_object"));
});
test("BOM, CRLF body, no closing newline and empty body survive update", () => {
  const raw = `\uFEFF${md.create(record("zhishi"), "").replace(/\n/g, "\r\n").replace(/\r\n$/, "")}`;
  const decoded = md.decode(raw);
  const next = md.update(raw, { ...decoded.attributes, mingcheng: "修改" }, decoded.body);
  assert.ok(next.startsWith("\uFEFF---\r\n"));
  assert.ok(next.endsWith("---"));
  assert.equal(md.decode(next).body, "");
  const rawBody = md.create(record("zhishi"), "- [ ] 原生\r\n正文\r\n");
  const after = md.update(rawBody, { ...md.decode(rawBody).attributes, mingcheng: "修改" }, md.decode(rawBody).body);
  assert.equal(md.decode(after).body, "- [ ] 原生\r\n正文\r\n");
});
test("malformed YAML, duplicate keys, aliases, custom tags and unsafe integers are read only", () => {
  for (const raw of ["普通正文", "---\nx: a\n", "---\nx: [bad\n---\n正文", "---\nx: 1\nx: 2\n---\n", "---\nx: &a [1]\ny: *a\n---\n", "---\nx: !custom value\n---\n", "---\nx: 9007199254740993\n---\n", "---\n[1,2]\n---\n", "---\n1: value\n---\n"]) throwsCode(() => md.decode(raw), "invalid_format");
});
test("JSON keeps unknown types and rejects duplicate keys at every level", () => {
  const attributes = record("jizhang", { old_field: { string: "false", bool: false, nothing: null, numbers: [0, 1.25] } });
  const raw = json.create(attributes);
  assert.deepEqual(json.decode(raw).attributes, attributes);
  assert.equal(json.decode(raw).body, "");
  for (const bad of ['{"x":1,"x":2}', '{"x":{"a":1,"a":2}}', '[1]', '{"x":NaN}', '{"x":9007199254740993}', '{"x":', '{"x":1,}', '\uFEFF{"x":1}']) throwsCode(() => json.decode(bad), "invalid_format");
  throwsCode(() => json.create(attributes, "正文"), "validation");
});
test("encoders refuse lossy values instead of silently stripping unknown data", () => {
  for (const extra of [undefined, NaN, Infinity, new Date(), new Map(), 10n, () => {}, [, 1]]) {
    for (const codec of [md, json]) throwsCode(() => codec.create({ ...record("zhishi"), extra }), "invalid_format");
  }
  const cycle = {}; cycle.self = cycle;
  throwsCode(() => md.create({ ...record("zhishi"), cycle }), "invalid_format");
});
test("safe paths reject traversal, absolute paths, hidden paths and Windows aliases", () => {
  for (const bad of ["/LifeOS/x", "C:/LifeOS/x", "\\server\\x", "LifeOS/../x", "LifeOS/./x", "LifeOS//x", "LifeOS/x ", "LifeOS/x.", "LifeOS/CON.md", "LifeOS/.obsidian/x", "LifeOS/a:b", "LifeOS/a?b", "LifeOS/a\u0000b"]) throwsCode(() => s.safePath(bad), "path");
  assert.equal(s.safePath("开发库/LifeOS/30_阅读/中文😀.md"), "开发库/LifeOS/30_阅读/中文😀.md");
  throwsCode(() => new s.StorageLayout("../root"), "path");
});
test("module mapping must not overlap or enter reserved folders", () => {
  throwsCode(() => new s.StorageLayout("LifeOS", { ...s.moduleFolders, youxi: "30_阅读/sub" }), "path");
  throwsCode(() => new s.StorageLayout("LifeOS", { ...s.moduleFolders, youxi: "30_阅读" }), "path");
  throwsCode(() => new s.StorageLayout("LifeOS", { ...s.moduleFolders, youxi: "99_回收与冲突/游戏" }), "path");
  const custom = new s.StorageLayout("测试/LifeOS");
  assert.equal(custom.module("riji"), "测试/LifeOS/10_日记");
});
test("module/source mismatch and wrong ledger filename are rejected before IO", async () => {
  const { notes, ledger, fs } = stores();
  await rejectsCode(notes.create(path("jizhang"), record("jizhang")), "path");
  await rejectsCode(ledger.create(path("zhishi"), record("zhishi")), "path");
  await rejectsCode(notes.create(path("riji"), record("zhishi")), "validation");
  await rejectsCode(ledger.create(layout.ledgerPath(other), record("jizhang")), "validation");
  await rejectsCode(notes.create("LifeOS-other/80_知识/a.md", record("zhishi")), "path");
  assert.equal(fs.calls.length, 0);
});
test("create never overwrites an existing file", async () => {
  const { fs, notes } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi"), body);
  await rejectsCode(notes.create(path("zhishi"), record("zhishi", { mingcheng: "覆盖" })), "already_exists");
  assert.equal(fs.files.get(path("zhishi")), initial.version.original);
});
test("field updates preserve original body and every unknown property", async () => {
  const { notes } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi", { old_title: "旧", unknown: { flags: [false, null, 2] } }), body);
  const next = await notes.update(initial.version, { set: { mingcheng: "新标题", neirong: "段落:\n第二行😀" } });
  assert.equal(next.body, body);
  assert.equal(next.attributes.old_title, "旧");
  assert.deepEqual(next.attributes.unknown, { flags: [false, null, 2] });
  assert.equal(next.attributes.chuangjianshijian, now);
  assert.equal(next.attributes.gengxinshijian, later);
  assert.equal(next.validation.ok, true);
});
test("body changes require explicit ownership; unset affects only the requested field", async () => {
  const { notes } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi", { neirong: "属性内容" }), body);
  const next = await notes.update(initial.version, { unset: ["neirong"], body: "新正文\r\n" });
  assert.equal(next.attributes.neirong, undefined);
  assert.equal(next.body, "新正文\r\n");
});
test("identity, schema, creation time and unknown attributes cannot be patched", async () => {
  const { notes, fs } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi", { unknown: "保留" }), body);
  for (const field of ["biaoshi", "shiti", "jiegoubanben", "chuangjianshijian", "gengxinshijian", "unknown", "english_new"]) {
    await rejectsCode(notes.update(initial.version, { set: { [field]: "值" } }), "validation");
    await rejectsCode(notes.update(initial.version, { unset: [field] }), "validation");
  }
  await rejectsCode(notes.update(initial.version, { set: { mingcheng: "名" }, unset: ["mingcheng"] }), "validation");
  assert.equal(fs.files.get(path("zhishi")), initial.version.original);
});
test("full original content catches external body edits even with unchanged timestamp", async () => {
  const { notes, fs } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi"), body);
  const changed = initial.version.original + "\n外部修改";
  fs.files.set(path("zhishi"), changed);
  await rejectsCode(notes.update(initial.version, { set: { mingcheng: "覆盖" } }), "conflict");
  assert.equal(fs.files.get(path("zhishi")), changed);
});
test("version comparison occurs inside process, after a last-moment external edit", async () => {
  const { notes, fs } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi"), body);
  fs.beforeProcess = (p) => fs.files.set(p, initial.version.original + "竞态修改");
  await rejectsCode(notes.update(initial.version, { set: { mingcheng: "覆盖" } }), "conflict");
  assert.ok(fs.files.get(path("zhishi")).endsWith("竞态修改"));
});
test("whitespace-only JSON edits also invalidate content versions", async () => {
  const { ledger, fs } = stores();
  const initial = await ledger.create(path("jizhang"), record("jizhang"));
  const changed = initial.version.original + " ";
  fs.files.set(path("jizhang"), changed);
  await rejectsCode(ledger.update(initial.version, { set: { jine: 500 } }), "conflict");
  assert.equal(fs.files.get(path("jizhang")), changed);
});
test("invalid output is rejected inside process without changing disk", async () => {
  const { notes, fs } = stores();
  const initial = await notes.create(path("riji"), record("riji"), body);
  await rejectsCode(notes.update(initial.version, { set: { neirong: "😀".repeat(501) } }), "validation");
  assert.equal(fs.files.get(path("riji")), initial.version.original);
  const valid = await notes.update(initial.version, { set: { neirong: "😀".repeat(500) } });
  assert.equal(valid.attributes.neirong.length, 1000);
  assert.equal(valid.body, body);
});
test("unknown versions are readable as invalid but cannot be updated or created", async () => {
  const { notes, fs } = stores();
  const raw = md.create({ ...record("zhishi"), jiegoubanben: 99 }, body);
  fs.files.set(path("zhishi"), raw);
  const initial = await notes.read(path("zhishi"));
  assert.equal(initial.validation.ok, false);
  assert.equal(initial.body, body);
  await rejectsCode(notes.update(initial.version, { set: { mingcheng: "修改" } }), "unsupported_version");
  await rejectsCode(notes.create(path("zhishi", "第二篇"), { ...record("zhishi", { biaoshi: other }), jiegoubanben: 1 }), "unsupported_version");
  assert.equal(fs.files.get(path("zhishi")), raw);
});
test("invalid business fields can be repaired explicitly without deleting drafts", async () => {
  const { notes, fs } = stores();
  const raw = md.create({ ...record("zhishi"), mingcheng: "" }, body);
  fs.files.set(path("zhishi"), raw);
  const initial = await notes.read(path("zhishi"));
  assert.equal(initial.validation.ok, false);
  const repaired = await notes.update(initial.version, { set: { mingcheng: "已完善" } });
  assert.equal(repaired.validation.ok, true);
  assert.equal(repaired.body, body);
});
test("malformed own files are never overwritten", async () => {
  const { notes, ledger, fs } = stores();
  for (const [store, p, raw] of [[notes, path("zhishi"), "---\nx: [\n---\n正文"], [ledger, path("jizhang"), "{bad"]]) {
    fs.files.set(p, raw);
    await rejectsCode(store.read(p), "invalid_format");
    await rejectsCode(store.update({ path: p, original: raw }, { set: { mingcheng: "新" } }), "invalid_format");
    assert.equal(fs.files.get(p), raw);
  }
});
test("duplicate UUID across MD and JSON makes both files read-only", async () => {
  const { notes, ledger, fs } = stores();
  fs.files.set(path("zhishi"), md.create(record("zhishi"), body));
  fs.files.set(path("jizhang"), json.create(record("jizhang")));
  const before = new Map(fs.files);
  await rejectsCode(notes.read(path("zhishi")), "duplicate_id");
  await rejectsCode(ledger.read(path("jizhang")), "duplicate_id");
  await rejectsCode(notes.update({ path: path("zhishi"), original: fs.files.get(path("zhishi")) }, { set: { mingcheng: "覆盖" } }), "duplicate_id");
  assert.deepEqual(fs.files, before);
});
test("duplicate UUID checks are case insensitive and ignore out-of-scope backups", async () => {
  const { notes, fs } = stores();
  fs.files.set("LifeOS/99_回收与冲突/副本.md", md.create(record("zhishi"), body));
  fs.files.set("个人笔记/副本.md", md.create(record("zhishi"), body));
  const initial = await notes.create(path("zhishi"), record("zhishi"), body);
  fs.files.set(path("youxi"), md.create(record("youxi", { biaoshi: id.toUpperCase() }), body));
  await rejectsCode(notes.update(initial.version, { set: { mingcheng: "变更" } }), "duplicate_id");
});
test("concurrent creates sharing the same file port cannot create duplicate UUIDs", async () => {
  const { notes, ledger, fs } = stores();
  const results = await Promise.allSettled([notes.create(path("zhishi"), record("zhishi")), ledger.create(path("jizhang"), record("jizhang"))]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "duplicate_id");
  assert.equal(fs.files.size, 1);
});
test("two writes based on the same version yield one success and one conflict", async () => {
  const { notes } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi"));
  const results = await Promise.allSettled([notes.update(initial.version, { set: { mingcheng: "甲" } }), notes.update(initial.version, { set: { mingcheng: "乙" } })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "conflict");
});
test("unreadable managed files allow reported reads but conservatively pause writes", async () => {
  const { notes, fs } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi"));
  fs.files.set(path("youxi"), "---\nx: [\n---\n保留");
  const read = await notes.read(path("zhishi"));
  assert.ok(read.validation.warnings.some((issue) => issue.message.includes("无法检查")));
  await rejectsCode(notes.update(initial.version, { set: { mingcheng: "新" } }), "invalid_format");
  assert.equal(fs.files.get(path("zhishi")), initial.version.original);
});
test("IO during identity scanning remains an IO error instead of malformed data", async () => {
  const { notes, fs } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi"));
  fs.files.set(path("youxi"), md.create(record("youxi", { biaoshi: other }), ""));
  const read = fs.read.bind(fs);
  fs.read = async (p) => { if (p === path("youxi")) throw new s.StoreError("io", "disk read failed", p); return read(p); };
  await rejectsCode(notes.update(initial.version, { set: { mingcheng: "更新" } }), "io");
  assert.equal(fs.files.get(path("zhishi")), initial.version.original);
});
test("files disappearing during identity scanning pause the mutation as a conflict", async () => {
  const { notes, fs } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi"));
  fs.files.set(path("youxi"), md.create(record("youxi", { biaoshi: other }), ""));
  const read = fs.read.bind(fs);
  fs.read = async (p) => { if (p === path("youxi")) throw new s.StoreError("not_found", "disappeared", p); return read(p); };
  await rejectsCode(notes.update(initial.version, { set: { mingcheng: "更新" } }), "conflict");
  assert.equal(fs.files.get(path("zhishi")), initial.version.original);
});
test("missing files and IO failures stay explicit and do not poison the mutation queue", async () => {
  const { notes, fs } = stores();
  await rejectsCode(notes.read(path("zhishi")), "not_found");
  fs.fail = "create";
  await rejectsCode(notes.create(path("zhishi"), record("zhishi")), "io");
  assert.equal(fs.files.size, 0);
  fs.fail = undefined;
  const initial = await notes.create(path("zhishi"), record("zhishi"));
  fs.fail = "process";
  await rejectsCode(notes.update(initial.version, { set: { mingcheng: "新" } }), "io");
  assert.equal(fs.files.get(path("zhishi")), initial.version.original);
  fs.fail = undefined;
  assert.equal((await notes.update(initial.version, { set: { mingcheng: "重试" } })).attributes.mingcheng, "重试");
});
test("successfully written files survive lost response without claiming success", async () => {
  const { notes, fs } = stores();
  fs.fail = "after-create";
  await rejectsCode(notes.create(path("zhishi"), record("zhishi")), "io");
  assert.equal(fs.files.size, 1);
  assert.equal((await notes.read(path("zhishi"))).validation.ok, true);
  fs.fail = undefined;
  await rejectsCode(notes.create(path("zhishi"), record("zhishi")), "already_exists");
});
test("no-op updates retain exact text and timestamps; stale no-ops still conflict", async () => {
  const { notes, fs } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi"), body);
  const unchanged = await notes.update(initial.version, { set: { mingcheng: "测试" } });
  assert.equal(unchanged.version.original, initial.version.original);
  assert.equal(unchanged.attributes.gengxinshijian, now);
  fs.files.set(path("zhishi"), initial.version.original + "变化");
  await rejectsCode(notes.update(initial.version, {}), "conflict");
});
test("bad clocks cannot move update time backwards", async () => {
  const { notes, fs } = stores(new MemoryFiles(), { now: () => "2026-10-08T14:00:00+08:00" });
  const initial = await notes.create(path("zhishi"), record("zhishi"), body);
  await rejectsCode(notes.update(initial.version, { set: { mingcheng: "新" } }), "validation");
  assert.equal(fs.files.get(path("zhishi")), initial.version.original);
});
test("ledger edits preserve unknown columns; recycle/restore keep UUID and file path", async () => {
  const { ledger, fs } = stores();
  const initial = await ledger.create(path("jizhang"), record("jizhang", { legacy: { bool: false, nothing: null } }));
  await rejectsCode(ledger.update(initial.version, { body: "" }), "validation");
  const updated = await ledger.update(initial.version, { set: { jine: 505 } });
  assert.deepEqual(updated.attributes.legacy, initial.attributes.legacy);
  const recycled = await ledger.recycle(updated.version);
  assert.equal(recycled.attributes.yihuishou, true);
  assert.equal(recycled.attributes.huishoushijian, later);
  const again = await ledger.recycle(recycled.version);
  assert.equal(again.version.original, recycled.version.original);
  const restored = await ledger.restore(again.version);
  assert.equal(restored.attributes.yihuishou, false);
  assert.equal(restored.attributes.huishoushijian, undefined);
  assert.equal(restored.attributes.biaoshi, id);
  assert.equal(restored.path, initial.path);
  assert.equal(fs.files.size, 1);
});
test("snapshotted edit values and version cannot be changed while awaiting the queue", async () => {
  const { notes, fs } = stores();
  const initial = await notes.create(path("zhishi"), record("zhishi"));
  let release;
  fs.beforeList = () => new Promise((resolve) => { release = resolve; });
  const version = { ...initial.version };
  const edit = { set: { mingcheng: "原请求", biaoqian: ["原标签"] }, unset: [] };
  const pending = notes.update(version, edit);
  await new Promise((resolve) => setImmediate(resolve));
  edit.set.biaoshi = other;
  edit.set.mingcheng = "篡改请求";
  edit.set.biaoqian.push("新增");
  edit.unset.push("chuangjianshijian");
  version.original = "篡改版本";
  release();
  const updated = await pending;
  assert.equal(updated.attributes.biaoshi, id);
  assert.equal(updated.attributes.mingcheng, "原请求");
  assert.deepEqual(updated.attributes.biaoqian, ["原标签"]);
});
test("a mutation of the caller's create object cannot bypass duplicate checks", async () => {
  const { notes, fs } = stores();
  fs.files.set(path("youxi"), md.create(record("youxi"), body));
  const candidate = record("zhishi");
  const pending = notes.create(path("zhishi"), candidate);
  candidate.biaoshi = other;
  await rejectsCode(pending, "duplicate_id");
  assert.equal(fs.files.size, 1);
});
