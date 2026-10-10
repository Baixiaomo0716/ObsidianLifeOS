import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import * as esbuild from "esbuild";
const result = await esbuild.build({ stdin: { contents: 'export * from "./src/storage/index"; export * from "./src/services/field-migration"; export * from "./src/services/note-properties";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "browser", format: "esm", write: false });
const x = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const id = '2b8b59b6-580d-459f-899c-051bc437ad73', time = '2026-10-09T07:46:22.028Z';
const common = { biaoshi: id, jiegoubanben: 2, chuangjianshijian: time, gengxinshijian: time };
test('all ten entity files use actual Chinese keys and values; canonical reads preserve identity', () => {
  for (const type of ['riji','jizhang','yuedu','yingshi','youxi','yanchu','lvxing','zhishi','daiban','xiangmu']) {
    const codec = type === 'jizhang' ? new x.JsonCodec() : new x.MarkdownCodec();
    const record = { ...common, shiti: type, jindu: 'weikaishi', biaoqian: ['标签'], mingcheng: '名字', ...(type === 'jizhang' ? { shouzhi: 'zhichu', jine: 1250 } : {}) };
    const raw = codec.create(record, '');
    assert.ok(raw.includes('创建时间')); assert.ok(raw.includes('结构版本')); assert.ok(!raw.includes('chuangjianshijian'));
    assert.ok(raw.includes('未开始')); assert.deepEqual(codec.decode(raw).attributes, record);
    if (type === 'jizhang') { const parsed = JSON.parse(raw); assert.equal(parsed.金额, 1250); assert.equal(parsed.收支, '支出'); assert.equal(parsed.结构版本, 3); }
  }
});
test('legacy YAML remains readable; renaming keys preserves comments, unknown attributes and exact body', () => {
  const codec = new x.MarkdownCodec();
  const raw = `---\r\nbiaoshi: ${id}\r\nshiti: zhishi\r\njiegoubanben: 2\r\n# 名称注释\r\nmingcheng: 旧名称 # 行尾注释\r\ncustom: { text: "正文", values: [1, true, null] }\r\n---\r\n\r\n用户正文\r\n`;
  const before = codec.decode(raw), updated = codec.update(raw, before.attributes, before.body);
  assert.ok(updated.includes('名称:')); assert.ok(updated.includes('# 名称注释')); assert.ok(updated.includes('# 行尾注释'));
  assert.deepEqual(codec.decode(updated), before); assert.ok(updated.endsWith(before.body));
});
test('legacy ledger JSON becomes Chinese without converting cent amounts or unknown nested keys', () => {
  const codec = new x.JsonCodec(), record = { ...common, shiti: 'jizhang', jine: 1250, shouzhi: 'shouru', custom: { biaoshi: 'user-owned' } };
  const raw = JSON.stringify(record), before = codec.decode(raw), after = codec.update(raw, before.attributes, '');
  assert.equal(JSON.parse(after).金额, 1250); assert.equal(JSON.parse(after).收支, '收入');
  assert.deepEqual(codec.decode(after), before); assert.equal(JSON.parse(after).custom.biaoshi, 'user-owned');
});
test('mixed duplicate aliases, damaged hidden metadata and unknown versions are never silently merged', () => {
  assert.throws(() => new x.MarkdownCodec().decode('---\nshiti: zhishi\n实体: 知识\n---\n'));
  assert.throws(() => new x.JsonCodec().decode('{"shiti":"jizhang","金额":1,"jine":2}'));
  assert.throws(() => x.migrateEntityFields('---\n实体: 知识\n结构版本: 99\n---\n', 'note', 'Asia/Shanghai'));
  assert.throws(() => new x.MarkdownCodec().decode('---\n实体: 日记\n---\n<!-- lifeos-shuxing bad -->\n'));
});
test('migration is idempotent and keeps the source identity, content and invalid business draft', () => {
  const raw = `---\nbiaoshi: ${id}\nshiti: zhishi\njiegoubanben: 2\nchuangjianshijian: ${time}\ngengxinshijian: ${time}\nmingcheng: ""\nbiaoqian: []\n---\n自由正文\n`;
  const migrated = x.migrateEntityFields(raw, 'note', 'Asia/Shanghai'), decoded = new x.MarkdownCodec().decode(migrated);
  assert.equal(decoded.attributes.biaoshi, id); assert.equal(decoded.attributes.mingcheng, ''); assert.equal(decoded.body, '自由正文\n');
  assert.equal(x.migrateEntityFields(migrated, 'note', 'Asia/Shanghai'), migrated);
});
test('migration rejects wrong sources and unsupported entity types before mutation', () => {
  const raw = new x.JsonCodec().create({ ...common, shiti: 'jizhang', jine: 1 });
  assert.throws(() => x.migrateEntityFields(raw, 'note', 'Asia/Shanghai'));
  assert.throws(() => x.migrateEntityFields('---\nshiti: unknown\njiegoubanben: 2\n---\n', 'note', 'Asia/Shanghai'));
});
test('nine public templates contain Chinese property names and retain canonical template variables', async () => {
  for (const type of ['日记','阅读','影视','游戏','演出','旅行','知识','待办','项目']) {
    const raw = await fs.readFile('templates/' + type + '.md', 'utf8'), yaml = raw.split('---')[1];
    assert.ok(/^实体:/m.test(yaml)); assert.ok(/^结构版本: 3/m.test(yaml));
    for (const key of Object.keys(x.fieldNames)) assert.ok(!new RegExp('^' + key + ':', 'm').test(yaml));
    const decoded = new x.MarkdownCodec().decode(raw); assert.equal(decoded.attributes.jiegoubanben, 2);
    if (type !== '日记') assert.equal(decoded.attributes.mingcheng, '{{title}}');
  }
});
test('Chinese date and datetime types cover every module while preserving unrelated native settings', () => {
  const config = JSON.parse(x.propertyTypes('{"types":{"tags":"tags","custom":"text"},"extra":true}'));
  for (const key of ['创建时间','更新时间','开始时间','读完时间','观看时间','时间','回收时间']) assert.equal(config.types[key], 'datetime');
  for (const key of ['日期','开始日期','截止日期','结束日期','上映时间','发行时间']) assert.equal(config.types[key], 'date');
  assert.equal(config.types.进度, 'multitext'); assert.equal(config.types.tags, 'tags'); assert.equal(config.extra, true);
});
