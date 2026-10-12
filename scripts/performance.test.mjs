import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services, clock, ids } from './verification-runtime.mjs';
async function fixture(extra = {}) {
  const files = new Map(), fs = { list: async () => [...files.keys()], read: async p => { if (!files.has(p)) throw new x.StoreError('not_found', 'missing'); return files.get(p); }, create: async (p, raw) => { if (files.has(p)) throw new x.StoreError('already_exists', 'exists'); files.set(p, raw); }, process: async (p, fn) => { const raw = fn(await fs.read(p)); files.set(p, raw); return raw; } };
  const s = services(fs), path = `${layout.module('yanchu')}/测试演出.md`;
  await s.notes.create(path, record('yanchu', undefined, { extra: { keep: true }, ...extra }), '自由正文\n'); await s.index.rebuild();
  const performance = new x.PerformanceService(s.index, s.operations, clock, ids, () => true);
  return { ...s, performance, files, path, source: performance.list().items[0] };
}
test('performance fields roundtrip with list bands and locations, free type, exact time and free body', async () => {
  const f = await fixture(), fields = { leixing: '音乐节', yueduimingcheng: ['乐队甲', '乐队乙'], didian: ['地点甲', '地点乙'], shijian: '2026-10-01T08:15:00+08:00', jianjie: '简介', pingjia: '评价', pingfen: 8.6, biaoqian: ['现场'] };
  await f.performance.execute(await f.performance.prepare(f.source, { fields, progress: 'jinxingzhong', body: '字'.repeat(700) }));
  const saved = f.performance.get(f.source.attributes.biaoshi);
  for (const [k, v] of Object.entries(fields)) assert.deepEqual(saved.attributes[k], v);
  assert.deepEqual(saved.attributes.extra, { keep: true }); assert.equal(saved.body.length, 700);
  const raw = f.files.get(f.path); assert.match(raw, /类型: "音乐节"/); assert.match(raw, /乐队名称:/); assert.match(raw, /tags:/); assert.doesNotMatch(raw, /\n标识:/);
});
test('performance progress completion and reopen leave event time intact, update home and diary relation', async () => {
  const f = await fixture({ shijian: '2026-09-01T00:00:00Z' });
  await f.notes.create(`${layout.module('riji')}/2026-10-12.md`, record('riji', undefined, { guanlian: [f.source.attributes.biaoshi] }), ''); await f.index.rebuild();
  await f.performance.execute(await f.performance.prepare(f.source, { fields: {}, progress: 'yiwancheng', body: f.source.body }));
  const done = f.performance.get(f.source.attributes.biaoshi); assert.equal(done.attributes.wanchengshijian, clock.now());
  await f.performance.execute(await f.performance.prepare(done, { fields: {}, progress: 'jinxingzhong', body: done.body }));
  const saved = f.performance.get(done.attributes.biaoshi); assert.equal(saved.attributes.wanchengshijian, undefined); assert.equal(saved.attributes.shijian, '2026-09-01T00:00:00Z');
  assert.equal(f.summary.read().ongoing.length, 1); assert.equal(f.search.relations(saved.attributes.biaoshi).incoming.length, 1);
});
test('performance rejects invalid event times, malformed bands/locations, score and identity edits', async () => {
  const f = await fixture(), before = f.files.get(f.path);
  for (const fields of [{ pingfen: 11 }, { pingfen: -1 }, { shijian: '2026-10-01' }, { shijian: '2026-02-30T00:00:00Z' }, { yueduimingcheng: 'band' }, { didian: 'venue' }, { biaoshi: ids.next() }]) await assert.rejects(f.performance.prepare(f.source, { fields, progress: 'weikaishi', body: '' }));
  assert.equal(f.files.get(f.path), before);
});
test('performance source conflict never overwrites external change and repeated request reuses receipt', async () => {
  const f = await fixture(), edit = { fields: { didian: ['场馆'] }, progress: 'weikaishi', body: f.source.body };
  const draft = await f.performance.prepare(f.source, edit); f.files.set(f.path, f.files.get(f.path) + '\n外部修改');
  await assert.rejects(f.performance.execute(draft), /已变化/); await f.index.rebuild();
  const current = f.performance.get(f.source.attributes.biaoshi), next = await f.performance.prepare(current, { ...edit, body: current.body });
  await Promise.all([f.performance.execute(next), f.performance.execute(next)]); const once = f.files.get(f.path); await f.performance.execute(next); assert.equal(f.files.get(f.path), once); assert.match(once, /外部修改/);
});
test('performance list searches all people and filters type, progress, exact tags and pages', async () => {
  const f = await fixture({ leixing: '音乐节', yueduimingcheng: ['乐队甲', '乐队乙'], didian: ['地点甲'], biaoqian: ['现场'], jindu: 'jinxingzhong' });
  assert.equal(f.performance.list('乐队乙 地点甲', 'jinxingzhong', '#现场', 1, '音乐节').total, 1); assert.equal(f.performance.list('', '', '', 1, '话剧').total, 0);
  const codec = new x.MarkdownCodec(); for (let n = 0; n < 51; n++) f.files.set(`${layout.module('yanchu')}/演出${n}.md`, codec.create(record('yanchu'), ''));
  f.files.set(`${layout.module('yuedu')}/阅读.md`, codec.create(record('yuedu'), '')); await f.index.rebuild();
  assert.equal(f.performance.list().total, 52); assert.equal(f.performance.list().items.length, 50); assert.equal(f.performance.list('', '', '', 2).items.length, 2);
  f.files.set(`${layout.module('yanchu')}/副本.md`, f.files.get(f.path)); await f.index.rebuild(); assert.equal(f.performance.list('乐队乙').total, 0);
});
test('clearing optional performance fields and no-op preserve body and original timestamp', async () => {
  const f = await fixture({ jianjie: '旧简介', pingfen: 0 });
  await f.performance.execute(await f.performance.prepare(f.source, { fields: { jianjie: '', pingfen: '' }, progress: 'weikaishi', body: f.source.body }));
  const saved = f.performance.get(f.source.attributes.biaoshi); assert.equal(saved.attributes.jianjie, undefined); assert.equal(saved.attributes.pingfen, undefined); assert.equal(saved.body, f.source.body);
  const before = f.files.get(f.path); await f.performance.execute(await f.performance.prepare(saved, { fields: {}, progress: 'weikaishi', body: saved.body })); assert.equal(f.files.get(f.path), before);
});
test('performance lost save response retries original receipt and does not replay changes', async () => {
  const f = await fixture(); let first = true;
  const performance = new x.PerformanceService(f.index, { run: async request => { const result = await f.operations.run(request); if (first) { first = false; throw Error('response lost'); } return result; } }, clock, ids, () => true);
  const draft = await performance.prepare(f.source, { fields: { pingjia: '保留一次' }, progress: 'yiwancheng', body: f.source.body });
  await assert.rejects(performance.execute(draft), /response lost/); const saved = f.files.get(f.path);
  await performance.execute(draft); assert.equal(f.files.get(f.path), saved); assert.equal(performance.get(f.source.attributes.biaoshi).attributes.pingjia, '保留一次');
});
