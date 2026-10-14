import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";
const result = await esbuild.build({ stdin: { contents: 'export * from "./src/services/template-service"; export * from "./src/services/template-initializer"; export * from "./src/services/note-templates"; export * from "./src/services/note-properties"; export * from "./src/domain/native-time"; export * from "./src/services/entity-index"; export * from "./src/services/operation-service"; export * from "./src/storage/index"; export * from "./src/domain/index";', resolveDir: process.cwd(), loader: "ts" }, loader: { ".md": "text" }, bundle: true, platform: "browser", format: "esm", write: false, logLevel: "silent", plugins: [mobileDependencyGuard()] });
const x = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const uuid = (n) => `${String(n).padStart(8, "0")}-9017-4db3-bc55-a0749d441ef2`, now = "2026-10-09T16:30:00Z";
class Files {
  files = new Map(); fault;
  async list() { return [...this.files.keys()]; }
  async read(path) { if (!this.files.has(path)) throw new x.StoreError("not_found", "missing"); return this.files.get(path); }
  async create(path, raw) { if (this.files.has(path)) throw new x.StoreError("already_exists", "exists"); this.files.set(path, raw); this.check("create", path); }
  async process(path, transform) { const raw = transform(await this.read(path)); this.files.set(path, raw); this.check("process", path); return raw; }
  check(kind, path) { if (this.fault?.kind === kind && this.fault.path === path) { this.fault = undefined; throw new x.StoreError("io", "lost response"); } }
}
function setup(fs = new Files(), options = {}) {
  const layout = new x.StorageLayout(options.root ?? "LifeOS"), clock = { now: () => now }, ids = { next: (() => { let n = options.seed ?? 100; return () => uuid(n++); })() };
  const device = { get: async () => options.device ?? uuid(1) }, fingerprint = { of: async (text) => createHash("sha256").update(text).digest("hex") };
  const notes = new x.NoteStore(fs, layout, clock), ledger = new x.LedgerStore(fs, layout, clock), index = new x.EntityIndex(fs, layout);
  const operations = new x.OperationService(fs, layout, notes, ledger, clock, ids, device, fingerprint);
  const templates = new x.TemplateService(fs, layout, index, operations, clock, ids, options.zone ?? "Asia/Shanghai", options.enabled ?? Object.keys(x.noteLabels));
  const initializer = new x.TemplateInitializer(fs, layout, index, clock, ids, device, fingerprint);
  return { fs, layout, notes, index, templates, initializer };
}
const expectCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);
test("diary month folders and readable task/project names contain no UUID suffix", async () => {
  const s = setup();
  assert.equal((await s.templates.prepare("riji", "")).lujing, "LifeOS/10_日记/2026-10/2026-10-10.md");
  for (const [type, folder] of [["daiban", "81_待办"], ["xiangmu", "82_项目"]]) {
    const first = await s.templates.prepare(type, "长名称测试"), path = await s.templates.execute(first), original = s.fs.files.get(path);
    assert.equal(path, type === "xiangmu" ? "LifeOS/82_项目/长名称测试/长名称测试.md" : `LifeOS/${folder}/长名称测试.md`);
    await expectCode(s.templates.execute(await s.templates.prepare(type, "长名称测试")), "conflict");
    assert.equal(s.fs.files.get(path), original);
  }
});
test("project folder keeps ordinary related documents out of the project index", async () => {
  const s = setup(), projectPath = await s.templates.execute(await s.templates.prepare("xiangmu", "新项目"));
  const documentPath = "LifeOS/82_项目/新项目/需求说明.md";
  s.fs.files.set(documentPath, "# 需求说明\n");
  assert.equal(projectPath, "LifeOS/82_项目/新项目/新项目.md");
  assert.equal(s.layout.isManaged(projectPath), true);
  assert.equal(s.layout.isManaged(documentPath), false);
  await s.index.rebuild();
  assert.equal(s.index.all().filter((row) => row.attributes.shiti === "xiangmu").length, 1);
  assert.equal(s.index.issues().some((issue) => issue.path === documentPath), false);
  assert.equal(s.layout.isManaged("LifeOS/82_项目/旧项目.md"), true);
});
test("simplified properties hide system and removed fields while preserving index identity/body", async () => {
  const s = setup();
  for (const type of ["riji", "daiban", "xiangmu"]) {
    const path = await s.templates.execute(await s.templates.prepare(type, "笔记")), raw = s.fs.files.get(path), yaml = raw.split("---")[1];
    const forbidden = type === "riji" ? ["biaoshi", "neirong", "guanlian"] : type === "daiban" ? ["mingcheng", "neirong", "guanlian", "yiguidang", "yiquxiao"] : ["daiban", "shangchuanwenjian", "neirong", "yiguidang", "yiquxiao"];
    for (const field of forbidden) assert.ok(!new RegExp(`^${field}:`, "m").test(yaml), `${type}.${field}`);
    assert.ok(x.uuidV4.test((await s.notes.read(path)).attributes.biaoshi));
    assert.ok(/^tags:/m.test(yaml));
    if (type !== "riji") for (const field of ["开始日期", "截止日期"]) assert.ok(new RegExp(`^${field}:`, "m").test(yaml));
    const snapshot = await s.notes.read(path); await s.notes.update(snapshot.version, { body: "自由正文\n<!-- 用户注释 -->\n" });
    assert.equal((await s.notes.read(path)).body, "自由正文\n<!-- 用户注释 -->\n");
  }
  await s.index.rebuild(); assert.equal(s.index.all().length, 3);
});
test("project Chinese progress survives codec roundtrip and completion transitions", async () => {
  const s = setup(), path = await s.templates.execute(await s.templates.prepare("xiangmu", "项目"));
  assert.ok(/进度:\n  - 未开始/.test(s.fs.files.get(path)));
  let snapshot = await s.notes.read(path);
  await s.notes.update(snapshot.version, { set: { jindu: "yiwancheng", wanchengshijian: now } });
  assert.ok(/进度:\n  - 已完成/.test(s.fs.files.get(path))); snapshot = await s.notes.read(path);
  assert.equal(snapshot.attributes.jindu, "yiwancheng");
  await s.notes.update(snapshot.version, { set: { jindu: "jinxingzhong" }, unset: ["wanchengshijian"] });
  assert.equal((await s.notes.read(path)).attributes.jindu, "jinxingzhong");
});
test("native local datetime resolves from saved zone, rejects DST ambiguity and supports CRLF metadata", async () => {
  assert.equal(x.nativeTime("2026-10-10T00:30", "Asia/Shanghai"), now.replace("00Z", "00.000Z"));
  assert.throws(() => x.nativeTime("2026-11-01T01:30", "America/New_York"));
  assert.throws(() => x.nativeTime("2026-03-08T02:30", "America/New_York"));
  const s = setup(), path = await s.templates.execute(await s.templates.prepare("daiban", "原生时间"));
  let raw = s.fs.files.get(path).replaceAll(now, "2026-10-10T00:30").replaceAll("\n", "\r\n");
  s.fs.files.set(path, raw); const snapshot = await s.notes.read(path);
  assert.equal(snapshot.validation.ok, true); assert.equal(snapshot.attributes.gengxinshijian, "2026-10-09T16:30:00.000Z");
  raw = raw.replace(/<!-- lifeos-shuxing .* -->/, "<!-- lifeos-shuxing broken -->");
  assert.throws(() => new x.MarkdownCodec().decode(raw));
});
test("property type configuration preserves other settings and refuses malformed input", () => {
  const result = JSON.parse(x.propertyTypes(JSON.stringify({ custom: true, types: { other: "number", kaishiriqi: "text" } })));
  assert.equal(result.custom, true); assert.equal(result.types.other, "number"); assert.equal(result.types.开始日期, "date");
  assert.equal(result.types.创建时间, "datetime"); assert.equal(result.types.tags, "tags"); assert.equal(result.types.进度, "multitext");
  assert.throws(() => x.propertyTypes("{broken")); assert.throws(() => x.propertyTypes('{"types":[]}'));
  assert.throws(() => x.propertyTypes('{"types":{},"types":{}}'));
});
test("all nine bundled templates create every visible field with unique identity and untouched body", async () => {
  const s = setup(), ids = [];
  for (const type of Object.keys(x.noteLabels)) {
    const draft = await s.templates.prepare(type, "模板测试"), path = await s.templates.execute(draft), snapshot = await s.notes.read(path);
    assert.equal(snapshot.validation.ok, true, type); ids.push(snapshot.attributes.biaoshi);
    const source = new x.MarkdownCodec().decode(x.bundledTemplates[type]);
    for (const key of Object.keys(source.attributes)) assert.ok(Object.hasOwn(snapshot.attributes, key), `${type}.${key}`);
    assert.equal(snapshot.body, source.body.replaceAll("{{date:YYYY-MM-DD}}", s.templates.today())); assert.equal(snapshot.attributes.chuangjianshijian, now);
  }
  assert.equal(new Set(ids).size, 9); assert.equal(s.index.all().length, 9);
});
test("timezone-derived diary date, weekday and lunar fields match; same day reopens existing", async () => {
  const s = setup(); assert.equal(s.templates.today(), "2026-10-10");
  const one = await s.templates.prepare("riji", ""), path = await s.templates.execute(one), two = await s.templates.prepare("riji", "");
  assert.equal(await s.templates.execute(two), path); assert.equal(s.index.all().length, 1);
  const record = (await s.notes.read(path)).attributes; assert.equal(record.xingqi, "星期六"); assert.equal(record.nongli, x.nongli("2026-10-10"));
});
test("concurrent diary submissions serialize locally and do not create two files", async () => {
  const s = setup(), first = await s.templates.prepare("riji", ""), second = await s.templates.prepare("riji", "");
  const paths = await Promise.all([s.templates.execute(first), s.templates.execute(second)]); assert.equal(paths[0], paths[1]);
});
test("repeat or uncertain create response uses the same operation and note UUID", async () => {
  const s = setup(), draft = await s.templates.prepare("zhishi", "重试"); s.fs.fault = { kind: "create", path: draft.lujing };
  await expectCode(s.templates.execute(draft), "io"); await s.templates.execute(draft); await s.templates.execute(draft);
  await s.index.rebuild(); assert.equal(s.index.all().length, 1);
});
test("names containing quotes, newline, colon and path characters remain data, not YAML injection", async () => {
  const s = setup(), title = '引号"：冒号\n---\nshiti: jizhang/../路径', draft = await s.templates.prepare("zhishi", title);
  const path = await s.templates.execute(draft), snapshot = await s.notes.read(path); assert.equal(snapshot.attributes.mingcheng, title); assert.equal(snapshot.attributes.shiti, "zhishi");
  assert.equal(path.split("/").length, 3); assert.ok(!path.includes("\n"));
});
test("invalid names, dates, disabled types and ledger template requests write nothing", async () => {
  const s = setup(undefined, { enabled: ["zhishi"] });
  for (const [type, name] of [["zhishi", ""], ["zhishi", "字".repeat(121)], ["jizhang", "账本"], ["youxi", "游戏"]]) await expectCode(s.templates.prepare(type, name), "validation");
  assert.equal(s.fs.files.size, 0); await expectCode(setup().templates.prepare("riji", "", "2026-02-30"), "validation");
});
test("template install is explicit, nine only, preserves user overrides and reports partial failure", async () => {
  const s = setup(); const path = s.templates.templatePath("zhishi"); s.fs.files.set(path, "我的模板");
  s.fs.fault = { kind: "create", path: s.templates.templatePath("riji") };
  const results = await s.templates.install(); assert.equal(results.length, 9); assert.equal(s.fs.files.get(path), "我的模板");
  assert.ok(results.some((item) => item.jieguo.includes("未确认")));
  assert.ok(results.some((item) => item.jieguo.includes("保留"))); await s.templates.install(); const before = [...s.fs.files]; await s.templates.install(); assert.deepEqual([...s.fs.files], before);
});
test("every TODO example receives a concrete per-item deadline when creating a note", async () => {
  const s = setup(), path = await s.templates.execute(await s.templates.prepare("daiban", "带截止时间的待办"));
  const body = (await s.notes.read(path)).body;
  const tasks = body.split("\n").filter(line => /^- \[[ x]\]/.test(line));
  assert.equal(tasks.length, 5);
  for (const task of tasks) assert.ok(task.endsWith("（截止：2026-10-10 23:59）"));
  assert.ok(!body.includes("{{date"));
});
test("new notes automatically upgrade all nine legacy stock templates", async () => {
  const s = setup();
  for (const type of Object.keys(x.noteLabels)) {
    const latest = x.bundledTemplates[type], path = s.templates.templatePath(type);
    s.fs.files.set(path, latest.slice(0, latest.indexOf("\n## ")).replaceAll("\n", "\r\n"));
    const note = await s.templates.execute(await s.templates.prepare(type, "自动带入"));
    assert.equal((await s.notes.read(note)).body, new x.MarkdownCodec().decode(latest).body.replaceAll("{{date:YYYY-MM-DD}}", s.templates.today()));
    assert.equal(s.fs.files.get(path), latest);
  }
});
test("tracked stock templates upgrade on new note creation while custom edits stay intact", async () => {
  const s = setup(), path = s.templates.templatePath("daiban"), baseline = `${s.layout.root}/00_系统/模板版本/待办.md`;
  await s.templates.install();
  const older = x.bundledTemplates.daiban.replace("整理所需资料与相关笔记", "旧版步骤");
  s.fs.files.set(path, older); s.fs.files.set(baseline, older);
  const created = await s.templates.execute(await s.templates.prepare("daiban", "新版待办"));
  assert.ok((await s.notes.read(created)).body.includes("整理所需资料与相关笔记"));
  const custom = x.bundledTemplates.daiban + "\n- [ ] 我的自定义步骤\n";
  s.fs.files.set(path, custom);
  const customNote = await s.templates.execute(await s.templates.prepare("daiban", "自定义待办"));
  assert.equal(s.fs.files.get(path), custom);
  assert.ok((await s.notes.read(customNote)).body.includes("我的自定义步骤"));
  assert.equal((await s.notes.read(created)).body.includes("我的自定义步骤"), false);
});
test("custom template retains unknown nested attributes/body and typed variable substitution", async () => {
  const s = setup(), codec = new x.MarkdownCodec(), decoded = codec.decode(x.bundledTemplates.zhishi);
  decoded.attributes.legacy = { title: "{{title}}", date: "{{date}}", values: [true, null, 1] };
  s.fs.files.set(s.templates.templatePath("zhishi"), codec.create(decoded.attributes, "\n# {{title}}\n- [ ] 自由正文\n"));
  const path = await s.templates.execute(await s.templates.prepare("zhishi", '书名"测试'));
  const snapshot = await s.notes.read(path); assert.equal(snapshot.attributes.legacy.title, '书名"测试'); assert.ok(snapshot.body.includes('- [ ] 自由正文'));
});
test("invalid override never falls back to bundled template; unsupported variables rejected", async () => {
  const s = setup(), path = s.templates.templatePath("zhishi");
  s.fs.files.set(path, "bad yaml"); await assert.rejects(s.templates.prepare("zhishi", "测试"));
  s.fs.files.set(path, x.bundledTemplates.zhishi + "{{unsupported}}"); await expectCode(s.templates.prepare("zhishi", "测试"), "validation");
  assert.equal(s.fs.files.size, 1);
});
test("optional null placeholders are effective absence while required fields and invalid dates still fail", () => {
  const s = setup(); const decoded = new x.MarkdownCodec().decode(x.bundledTemplates.yuedu);
  const record = { ...decoded.attributes, biaoshi: uuid(5), chuangjianshijian: now, gengxinshijian: now, mingcheng: "阅读" };
  const result = x.validateRecord(record); assert.equal(result.ok, true); assert.equal(result.value.duwanshijian, undefined);
  assert.equal(x.validateRecord({ ...record, mingcheng: null }).ok, false); assert.equal(x.validateRecord({ ...record, kaishishijian: "invalid" }).ok, false);
  assert.equal(x.validateRecord({ ...record, biaoqian: null }).ok, false); assert.ok(s);
});
test("manual template initialization fills only missing identity/timestamps and preserves invalid draft/body", async () => {
  const s = setup(), path = `${s.layout.module("zhishi")}/手工初稿.md`, raw = x.bundledTemplates.zhishi + "\n用户正文\n"; s.fs.files.set(path, raw);
  const request = await s.initializer.prepare(path); await s.initializer.execute(request); await s.initializer.execute(request);
  const snapshot = await s.notes.read(path); assert.ok(x.uuidV4.test(snapshot.attributes.biaoshi)); assert.equal(snapshot.body, new x.MarkdownCodec().decode(raw).body);
  assert.equal(snapshot.attributes.mingcheng, "{{title}}"); assert.equal(snapshot.validation.ok, false);
  await s.notes.update(snapshot.version, { set: { mingcheng: "已完善" } }); await s.index.rebuild(); assert.equal(s.index.all().length, 1);
});
test("initializer refuses existing identities, unknown schema, and changed original", async () => {
  const s = setup(), path = `${s.layout.module("zhishi")}/初稿.md`; s.fs.files.set(path, x.bundledTemplates.zhishi);
  const request = await s.initializer.prepare(path); s.fs.files.set(path, x.bundledTemplates.zhishi + "变更"); await expectCode(s.initializer.execute(request), "conflict");
  const other = `${s.layout.module("zhishi")}/another.md`; s.fs.files.set(other, x.bundledTemplates.zhishi.replace("结构版本: 3", "结构版本: 99")); await expectCode(s.initializer.prepare(other), "unsupported_version");
  const complete = await s.templates.execute(await s.templates.prepare("zhishi", "完整")); await expectCode(s.initializer.prepare(complete), "validation");
});
test("uncertain initialization write recovers from persisted request after new service instance", async () => {
  const s = setup(), path = `${s.layout.module("zhishi")}/初稿.md`; s.fs.files.set(path, x.bundledTemplates.zhishi);
  const request = await s.initializer.prepare(path); s.fs.fault = { kind: "process", path }; await expectCode(s.initializer.execute(request), "io");
  const raw = await s.fs.read(path), restarted = setup(s.fs, { seed: 500 }); const recovered = await restarted.initializer.prepare(path);
  assert.deepEqual(recovered, request); await restarted.initializer.execute(recovered); assert.equal(await s.fs.read(path), raw);
});
test("foreign pending initialization is not taken over and tampered target cannot change body", async () => {
  const s = setup(), path = `${s.layout.module("zhishi")}/初稿.md`; s.fs.files.set(path, x.bundledTemplates.zhishi); const request = await s.initializer.prepare(path);
  await expectCode(setup(s.fs, { device: uuid(2) }).initializer.execute(request), "foreign_operation");
  await expectCode(s.initializer.execute({ ...request, mubiaoyuanwen: request.mubiaoyuanwen + "覆写" }), "validation");
});
