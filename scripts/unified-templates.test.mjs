import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import * as esbuild from 'esbuild';
const result = await esbuild.build({ stdin: { contents: 'export * from "./src/storage/index"; export * from "./src/services/field-migration"; export * from "./src/services/note-properties"; export * from "./src/services/readable-note-name"; export * from "./src/domain/validation";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'browser', write: false });
const x = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
test('all nine templates hide removed fields, use native tags, and expose progress lists except diary', async () => {
 for (const name of ['日记','阅读','影视','游戏','演出','旅行','知识','待办','项目']) {
  const raw = await fs.readFile('templates/' + name + '.md','utf8'), yaml = raw.split('---')[1];
  for (const key of ['标签','标识','名称','已归档','已取消','状态']) assert.ok(!new RegExp('^' + key + ':','m').test(yaml),name + key);
  assert.ok(/^tags: \[\]/m.test(yaml));
  if (name === '日记') assert.ok(!/^进度:/m.test(yaml)); else assert.ok(/进度:\n  - 未开始/.test(yaml));
  const record = new x.MarkdownCodec().decode(raw).attributes;
  if (name === '阅读') assert.equal(record.zhuangtai,'weikaishi');
  else if (name !== '日记') assert.equal(record.jindu,'weikaishi');
 }
});
test('legacy labels and native tags merge without loss while conflicting aliases are refused', () => {
 const codec = new x.MarkdownCodec();
 const input = '---\n实体: 知识\n结构版本: 3\n标签: [旧标签, 重复]\ntags: [新标签, 重复]\n---\n正文\n';
 assert.deepEqual(codec.decode(input).attributes.biaoqian,['旧标签','重复','新标签']);
 assert.deepEqual(codec.decode('---\n实体: 知识\ntags: 单个标签\n---\n').attributes.biaoqian,['单个标签']);
 assert.throws(() => codec.decode('---\n实体: 知识\n标签: [甲]\nbiaoqian: [乙]\ntags: []\n---\n'));
});
test('multiple progress selections remain a visible invalid draft without silently picking a status', () => {
 const codec = new x.MarkdownCodec();
 const raw = '---\n实体: 阅读\n进度: [未开始, 进行中]\n---\n';
 assert.deepEqual(codec.decode(raw).attributes.zhuangtai,['weikaishi','jinxingzhong']);
 assert.equal(x.validateRecord(codec.decode(raw).attributes).ok,false);
});
test('uniform migration preserves hidden identity/name/archive history and exact body and is repeatable', () => {
 const codec = new x.MarkdownCodec(), old = { shiti:'zhishi', jiegoubanben:2, biaoshi:'2b8b59b6-580d-459f-899c-051bc437ad73', mingcheng:'旧名称', biaoqian:['保留'] };
 const original = codec.create(old,'用户正文\n'), migrated = x.migrateEntityFields(original,'note','Asia/Shanghai'), yaml = migrated.split('---')[1];
 assert.ok(!/^名称:/m.test(yaml)); assert.ok(!/^标识:/m.test(yaml)); assert.ok(/^tags:/m.test(yaml));
 const after = codec.decode(migrated); assert.equal(after.attributes.biaoshi,old.biaoshi); assert.equal(after.attributes.mingcheng,old.mingcheng);
 assert.equal(after.attributes.jindu,'weikaishi'); assert.equal(after.body,'用户正文\n');
 assert.equal(x.migrateEntityFields(migrated,'note','Asia/Shanghai'),migrated);
 const managed = codec.create({ ...old, shuxingmoshi:'tongyi', yiguidang:true, yiquxiao:true, jindu:'weikaishi' },'');
 assert.ok(!/^已归档:/m.test(managed)); assert.ok(!/^已取消:/m.test(managed));
 assert.equal(codec.decode(managed).attributes.yiguidang,true); assert.equal(codec.decode(managed).attributes.yiquxiao,true);
});
test('readable filenames strip trailing UUIDs and choose human numbering for collisions', () => {
 const path = 'LifeOS/知识/标题-2b8b59b6-580d-459f-899c-051bc437ad73.md';
 assert.equal(x.readableNoteName(path,new Set()),'LifeOS/知识/标题.md');
 assert.equal(x.readableNoteName(path,new Set(['lifeos/知识/标题.md','lifeos/知识/标题（2）.md'])),'LifeOS/知识/标题（3）.md');
 assert.equal(x.readableNoteName('LifeOS/知识/普通标题.md',new Set()),'LifeOS/知识/普通标题.md');
 assert.throws(() => x.readableNoteName('../标题.md',new Set()));
});
test('native type configuration uses tags and list progress and all date fields use appropriate widgets', () => {
 const config = JSON.parse(x.propertyTypes('{"types":{"标签":"multitext","custom":"text"}}'));
 assert.equal(config.types.tags,'tags'); assert.equal(config.types.进度,'multitext'); assert.equal(config.types.标签,undefined);
 for (const field of ['创建时间','更新时间']) assert.equal(config.types[field],'datetime');
 for (const field of ['开始日期','截止日期']) assert.equal(config.types[field],'date');
 assert.equal(config.types.custom,'text');
});
