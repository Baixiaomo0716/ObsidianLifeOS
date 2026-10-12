import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services, clock, ids } from './verification-runtime.mjs';
async function fixture(extra = {}) {
  const files = new Map(), fs = { list: async () => [...files.keys()], read: async p => { if (!files.has(p)) throw new x.StoreError('not_found', 'missing'); return files.get(p); }, create: async (p, raw) => { if (files.has(p)) throw new x.StoreError('already_exists', 'exists'); files.set(p, raw); }, process: async (p, fn) => { const raw = fn(await fs.read(p)); files.set(p, raw); return raw; } };
  const s = services(fs), path = `${layout.module('lvxing')}/测试旅行.md`;
  await s.notes.create(path, record('lvxing', undefined, { extra: { keep: true }, ...extra }), '自由正文\n'); await s.index.rebuild();
  const travel = new x.TravelService(s.index, s.operations, clock, ids, () => true);
  return { ...s, travel, files, path, source: travel.list().items[0] };
}
test('travel date and lists roundtrip in Chinese Markdown with free body and unknown attributes', async () => {
  const f = await fixture(), fields = { kaishiriqi: '2026-10-01', jieshuriqi: '2026-10-07', didian: ['北京', '天津'], jiaotonggongju: ['高铁', '地铁'], zhusu: ['酒店甲', '酒店乙'], pingjia: '旅途评价', biaoqian: ['假期'] };
  await f.travel.execute(await f.travel.prepare(f.source, { fields, progress: 'jinxingzhong', body: '字'.repeat(700) }));
  const saved = f.travel.get(f.source.attributes.biaoshi);
  for (const [k, v] of Object.entries(fields)) assert.deepEqual(saved.attributes[k], v);
  assert.deepEqual(saved.attributes.extra, { keep: true }); assert.equal(saved.body.length, 700);
  const raw = f.files.get(f.path); assert.match(raw, /开始日期: "2026-10-01"/); assert.match(raw, /住宿:/); assert.match(raw, /tags:/); assert.doesNotMatch(raw, /\n(?:标识|名称|预算):/);
});
test('travel same-day and partial dates allowed, invalid dates/order reject without writes', async () => {
  const f = await fixture(), before = f.files.get(f.path);
  for (const fields of [{ kaishiriqi: '2023-02-29' }, { jieshuriqi: '2026-10-01T00:00:00Z' }, { kaishiriqi: '2026-10-07', jieshuriqi: '2026-10-01' }, { didian: '北京' }, { zhusu: [1] }, { jiaotonggongju: '高铁' }, { biaoshi: ids.next() }, { yusuan: 100 }]) await assert.rejects(f.travel.prepare(f.source, { fields, progress: 'weikaishi', body: '' }));
  assert.equal(f.files.get(f.path), before);
  await f.travel.execute(await f.travel.prepare(f.source, { fields: { kaishiriqi: '2024-02-29', jieshuriqi: '2024-02-29' }, progress: 'weikaishi', body: f.source.body }));
  const sameDay = f.travel.get(f.source.attributes.biaoshi); await f.travel.execute(await f.travel.prepare(sameDay, { fields: { jieshuriqi: '' }, progress: 'weikaishi', body: sameDay.body }));
  assert.equal(f.travel.get(sameDay.attributes.biaoshi).attributes.jieshuriqi, undefined);
});
test('travel progress completion/reopen keep itinerary dates and update home and diary relations', async () => {
  const f = await fixture({ kaishiriqi: '2026-10-01', jieshuriqi: '2026-10-07' });
  await f.notes.create(`${layout.module('riji')}/2026-10-12.md`, record('riji', undefined, { guanlian: [f.source.attributes.biaoshi] }), ''); await f.index.rebuild();
  await f.travel.execute(await f.travel.prepare(f.source, { fields: {}, progress: 'yiwancheng', body: f.source.body }));
  const done = f.travel.get(f.source.attributes.biaoshi); assert.equal(done.attributes.wanchengshijian, clock.now());
  await f.travel.execute(await f.travel.prepare(done, { fields: {}, progress: 'jinxingzhong', body: done.body }));
  const saved = f.travel.get(done.attributes.biaoshi); assert.equal(saved.attributes.wanchengshijian, undefined); assert.equal(saved.attributes.jieshuriqi, '2026-10-07');
  assert.equal(f.summary.read().ongoing.length, 1); assert.equal(f.search.relations(saved.attributes.biaoshi).incoming.length, 1);
});
test('travel conflict never overwrites external changes and repeated request remains idempotent', async () => {
  const f = await fixture(), edit = { fields: { pingjia: '评价' }, progress: 'weikaishi', body: f.source.body };
  const draft = await f.travel.prepare(f.source, edit); f.files.set(f.path, f.files.get(f.path) + '\n外部修改');
  await assert.rejects(f.travel.execute(draft), /已变化/); await f.index.rebuild();
  const current = f.travel.get(f.source.attributes.biaoshi), next = await f.travel.prepare(current, { ...edit, body: current.body });
  await Promise.all([f.travel.execute(next), f.travel.execute(next)]); const once = f.files.get(f.path); await f.travel.execute(next); assert.equal(f.files.get(f.path), once); assert.match(once, /外部修改/);
});
test('travel search includes all destinations transport and hotels, filters and excludes duplicates', async () => {
  const f = await fixture({ didian: ['北京', '天津'], jiaotonggongju: ['高铁'], zhusu: ['酒店甲'], biaoqian: ['假期'], jindu: 'jinxingzhong' });
  assert.equal(f.travel.list('天津 高铁 酒店甲', 'jinxingzhong', '#假期').total, 1); assert.equal(f.travel.list('', 'yiwancheng').total, 0);
  const codec = new x.MarkdownCodec(); for (let n = 0; n < 51; n++) f.files.set(`${layout.module('lvxing')}/旅行${n}.md`, codec.create(record('lvxing'), ''));
  f.files.set(`${layout.module('yuedu')}/阅读.md`, codec.create(record('yuedu'), '')); await f.index.rebuild();
  assert.equal(f.travel.list().total, 52); assert.equal(f.travel.list().items.length, 50); assert.equal(f.travel.list('', '', '', 2).items.length, 2);
  f.files.set(`${layout.module('lvxing')}/副本.md`, f.files.get(f.path)); await f.index.rebuild(); assert.equal(f.travel.list('酒店甲').total, 0);
});
test('travel optional fields clear without body loss, no-op retains raw content and stopped service rejects', async () => {
  const f = await fixture({ pingjia: '旧评价', kaishiriqi: '2020-01-01' });
  await f.travel.execute(await f.travel.prepare(f.source, { fields: { pingjia: '', kaishiriqi: '' }, progress: 'weikaishi', body: f.source.body }));
  const saved = f.travel.get(f.source.attributes.biaoshi); assert.equal(saved.attributes.pingjia, undefined); assert.equal(saved.attributes.kaishiriqi, undefined);
  const before = f.files.get(f.path); await f.travel.execute(await f.travel.prepare(saved, { fields: {}, progress: 'weikaishi', body: saved.body })); assert.equal(f.files.get(f.path), before);
  const stopped = new x.TravelService(f.index, f.operations, clock, ids, () => false); await assert.rejects(stopped.prepare(saved, { fields: {}, progress: 'weikaishi', body: '' }), /停止/);
});
test('travel lost save response retries receipt and does not replay changes', async () => {
  const f = await fixture(); let first = true;
  const travel = new x.TravelService(f.index, { run: async request => { const result = await f.operations.run(request); if (first) { first = false; throw Error('response lost'); } return result; } }, clock, ids, () => true);
  const draft = await travel.prepare(f.source, { fields: { pingjia: '保留一次' }, progress: 'yiwancheng', body: f.source.body });
  await assert.rejects(travel.execute(draft), /response lost/); const saved = f.files.get(f.path); await travel.execute(draft); assert.equal(f.files.get(f.path), saved);
});
