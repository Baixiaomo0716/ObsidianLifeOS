import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services, clock, ids } from './verification-runtime.mjs';
async function fixture(extra = {}) {
  const files = new Map(), fs = { list: async () => [...files.keys()], read: async p => { if (!files.has(p)) throw new x.StoreError('not_found', 'missing'); return files.get(p); }, create: async (p, raw) => { if (files.has(p)) throw new x.StoreError('already_exists', 'exists'); files.set(p, raw); }, process: async (p, fn) => { const raw = fn(await fs.read(p)); files.set(p, raw); return raw; } };
  const s = services(fs), path = `${layout.module('yuedu')}/测试书.md`;
  await s.notes.create(path, record('yuedu', undefined, { extra: { keep: true }, ...extra }), '自由正文\n'); await s.index.rebuild();
  const reading = new x.ReadingService(s.index, s.operations, clock, ids, () => true);
  return { ...s, reading, files, path, source: reading.list().items[0] };
}
test('reading edits all dedicated fields, preserves unknown data and publishes Chinese Markdown', async () => {
  const f = await fixture(); const fields = { zuozhe: '作者', laiyuan: '纸书', leixing: '小说', biaoqian: ['文学'], zishu: 123456, jianjie: '简介', pingjia: '感想', pingfen: 8.5, kaishishijian: '2026-10-01T08:00:00+08:00', duwanshijian: '2026-10-11T09:00:00+08:00' };
  const draft = await f.reading.prepare(f.source, { fields, progress: 'yiwancheng', body: '# 长正文\n' + '字'.repeat(600) });
  await f.reading.execute(draft); const result = f.reading.get(f.source.attributes.biaoshi);
  for (const [k, v] of Object.entries(fields)) assert.deepEqual(result.attributes[k], v);
  assert.equal(result.attributes.wanchengshijian, fields.duwanshijian); assert.deepEqual(result.attributes.extra, { keep: true }); assert.ok(result.body.length > 600);
  const raw = f.files.get(f.path); assert.match(raw, /作者:/); assert.match(raw, /tags:/); assert.doesNotMatch(raw, /\n标识:/);
});
test('reading completion populates time, reopening clears both timestamps and updates home/search', async () => {
  const f = await fixture(); await f.reading.execute(await f.reading.prepare(f.source, { fields: {}, progress: 'yiwancheng', body: f.source.body }));
  const done = f.reading.get(f.source.attributes.biaoshi); assert.equal(done.attributes.duwanshijian, clock.now());
  await f.reading.execute(await f.reading.prepare(done, { fields: {}, progress: 'jinxingzhong', body: done.body }));
  const reopened = f.reading.get(done.attributes.biaoshi); assert.equal(reopened.attributes.duwanshijian, undefined); assert.equal(reopened.attributes.wanchengshijian, undefined);
  assert.equal(f.summary.read().ongoing.length, 1); assert.equal(f.search.query({ type: 'yuedu', progress: 'jinxingzhong' }).total, 1);
});
test('invalid score, word count, progress/date combination and date order never write', async () => {
  const f = await fixture(); const original = f.files.get(f.path);
  for (const fields of [{ pingfen: 11 }, { zishu: 1.5 }, { kaishishijian: 'bad' }, { duwanshijian: clock.now() }]) await assert.rejects(f.reading.prepare(f.source, { fields, progress: 'weikaishi', body: '' }));
  await assert.rejects(f.reading.prepare(f.source, { fields: { kaishishijian: '2026-10-11T00:00:00Z', duwanshijian: '2026-10-01T00:00:00Z' }, progress: 'yiwancheng', body: '' }));
  await assert.rejects(f.reading.prepare(f.source, { fields: { biaoshi: ids.next() }, progress: 'weikaishi', body: '' })); assert.equal(f.files.get(f.path), original);
});
test('prepared reading save refuses externally changed source and repeated execution remains idempotent', async () => {
  const f = await fixture(), edit = { fields: { zuozhe: '新作者' }, progress: 'weikaishi', body: f.source.body };
  const draft = await f.reading.prepare(f.source, edit); f.files.set(f.path, f.files.get(f.path) + '\n外部修改');
  await assert.rejects(f.reading.execute(draft), /已变化/); assert.match(f.files.get(f.path), /外部修改/);
  await f.index.rebuild(); const current = f.reading.get(f.source.attributes.biaoshi), next = await f.reading.prepare(current, { ...edit, body: current.body });
  await Promise.all([f.reading.execute(next), f.reading.execute(next)]); const once = f.files.get(f.path); await f.reading.execute(next); assert.equal(f.files.get(f.path), once);
});
test('reading search includes author, exact tags and bounded pages, unrelated records stay excluded', async () => {
  const f = await fixture({ zuozhe: '独特作者', biaoqian: ['文学'] });
  assert.equal(f.reading.list('独特作者', '', '#文学').total, 1); assert.equal(f.reading.list('', 'yiwancheng').total, 0);
  const codec = new x.MarkdownCodec(); for (let n = 0; n < 51; n++) f.files.set(`${layout.module('yuedu')}/书${n}.md`, codec.create(record('yuedu'), ''));
  f.files.set(`${layout.module('youxi')}/游戏.md`, codec.create(record('youxi'), '')); await f.index.rebuild();
  assert.equal(f.reading.list().total, 52); assert.equal(f.reading.list().items.length, 50); assert.equal(f.reading.list('', '', '', 2).items.length, 2);
  f.files.set(`${layout.module('yuedu')}/副本.md`, f.files.get(f.path)); await f.index.rebuild(); assert.equal(f.reading.list('独特作者').total, 0);
});
test('relation lookup retains stable reading identity after metadata and progress editing', async () => {
  const f = await fixture(); const diaryPath = `${layout.module('riji')}/2026-10-12.md`;
  await f.notes.create(diaryPath, record('riji', undefined, { guanlian: [f.source.attributes.biaoshi] }), ''); await f.index.rebuild();
  await f.reading.execute(await f.reading.prepare(f.source, { fields: { zuozhe: '关联作者' }, progress: 'jinxingzhong', body: f.source.body }));
  assert.equal(f.search.relations(f.source.attributes.biaoshi).incoming.length, 1);
});
