import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services, clock, ids } from './verification-runtime.mjs';
async function fixture(extra = {}) {
  const files = new Map(), fs = { list: async () => [...files.keys()], read: async p => { if (!files.has(p)) throw new x.StoreError('not_found', 'missing'); return files.get(p); }, create: async (p, raw) => { if (files.has(p)) throw new x.StoreError('already_exists', 'exists'); files.set(p, raw); }, process: async (p, fn) => { const raw = fn(await fs.read(p)); files.set(p, raw); return raw; } };
  const s = services(fs), path = `${layout.module('yingshi')}/测试影片.md`;
  await s.notes.create(path, record('yingshi', undefined, { extra: { keep: true }, ...extra }), '自由正文\n'); await s.index.rebuild();
  const film = new x.FilmService(s.index, s.operations, clock, ids, () => true);
  return { ...s, film, files, path, source: film.list().items[0] };
}
test('film fields roundtrip with list people, Chinese type, exact dates and free body', async () => {
  const f = await fixture(), fields = { leixing: 'dianying', daoyan: ['导演甲', '导演乙'], zhuyan: ['主演甲', '主演乙'], shangyingshijian: '2020-02-29', guankanshijian: '2026-10-01T08:15:00+08:00', jianjie: '简介', pingjia: '评价', doubanpingfen: 8.6, biaoqian: ['电影'] };
  await f.film.execute(await f.film.prepare(f.source, { fields, progress: 'jinxingzhong', body: '字'.repeat(700) }));
  const saved = f.film.get(f.source.attributes.biaoshi);
  for (const [k, v] of Object.entries(fields)) assert.deepEqual(saved.attributes[k], v);
  assert.deepEqual(saved.attributes.extra, { keep: true }); assert.equal(saved.body.length, 700);
  const raw = f.files.get(f.path); assert.match(raw, /类型: "电影"/); assert.match(raw, /导演:/); assert.match(raw, /tags:/); assert.doesNotMatch(raw, /\n标识:/);
});
test('film progress completion and reopen leave viewing date intact, update home and diary relation', async () => {
  const f = await fixture({ guankanshijian: '2026-09-01T00:00:00Z' });
  await f.notes.create(`${layout.module('riji')}/2026-10-12.md`, record('riji', undefined, { guanlian: [f.source.attributes.biaoshi] }), ''); await f.index.rebuild();
  await f.film.execute(await f.film.prepare(f.source, { fields: {}, progress: 'yiwancheng', body: f.source.body }));
  const done = f.film.get(f.source.attributes.biaoshi); assert.equal(done.attributes.wanchengshijian, clock.now());
  await f.film.execute(await f.film.prepare(done, { fields: {}, progress: 'jinxingzhong', body: done.body }));
  const saved = f.film.get(done.attributes.biaoshi); assert.equal(saved.attributes.wanchengshijian, undefined); assert.equal(saved.attributes.guankanshijian, '2026-09-01T00:00:00Z');
  assert.equal(f.summary.read().ongoing.length, 1); assert.equal(f.search.relations(saved.attributes.biaoshi).incoming.length, 1);
});
test('film rejects invalid dates, unknown types, malformed people, score and identity edits', async () => {
  const f = await fixture(), before = f.files.get(f.path);
  for (const fields of [{ doubanpingfen: 11 }, { doubanpingfen: -1 }, { shangyingshijian: '2023-02-29' }, { guankanshijian: '2026-10-01' }, { leixing: 'unknown' }, { daoyan: 'director' }, { biaoshi: ids.next() }]) await assert.rejects(f.film.prepare(f.source, { fields, progress: 'weikaishi', body: '' }));
  assert.equal(f.files.get(f.path), before);
});
test('film source conflict never overwrites external change and repeated request reuses receipt', async () => {
  const f = await fixture(), edit = { fields: { zhuyan: ['演员'] }, progress: 'weikaishi', body: f.source.body };
  const draft = await f.film.prepare(f.source, edit); f.files.set(f.path, f.files.get(f.path) + '\n外部修改');
  await assert.rejects(f.film.execute(draft), /已变化/); await f.index.rebuild();
  const current = f.film.get(f.source.attributes.biaoshi), next = await f.film.prepare(current, { ...edit, body: current.body });
  await Promise.all([f.film.execute(next), f.film.execute(next)]); const once = f.files.get(f.path); await f.film.execute(next); assert.equal(f.files.get(f.path), once); assert.match(once, /外部修改/);
});
test('film list searches all people and filters type, progress, exact tags and pages', async () => {
  const f = await fixture({ leixing: 'dianying', daoyan: ['导演甲', '导演乙'], zhuyan: ['主演甲'], biaoqian: ['电影'], jindu: 'jinxingzhong' });
  assert.equal(f.film.list('导演乙 主演甲', 'jinxingzhong', '#电影', 1, 'dianying').total, 1); assert.equal(f.film.list('', '', '', 1, 'dianshiju').total, 0);
  const codec = new x.MarkdownCodec(); for (let n = 0; n < 51; n++) f.files.set(`${layout.module('yingshi')}/影片${n}.md`, codec.create(record('yingshi'), ''));
  f.files.set(`${layout.module('yuedu')}/阅读.md`, codec.create(record('yuedu'), '')); await f.index.rebuild();
  assert.equal(f.film.list().total, 52); assert.equal(f.film.list().items.length, 50); assert.equal(f.film.list('', '', '', 2).items.length, 2);
  f.files.set(`${layout.module('yingshi')}/副本.md`, f.files.get(f.path)); await f.index.rebuild(); assert.equal(f.film.list('导演乙').total, 0);
});
test('clearing optional film fields and no-op preserve body and original timestamp', async () => {
  const f = await fixture({ jianjie: '旧简介', doubanpingfen: 0 });
  await f.film.execute(await f.film.prepare(f.source, { fields: { jianjie: '', doubanpingfen: '' }, progress: 'weikaishi', body: f.source.body }));
  const saved = f.film.get(f.source.attributes.biaoshi); assert.equal(saved.attributes.jianjie, undefined); assert.equal(saved.attributes.doubanpingfen, undefined); assert.equal(saved.body, f.source.body);
  const before = f.files.get(f.path); await f.film.execute(await f.film.prepare(saved, { fields: {}, progress: 'weikaishi', body: saved.body })); assert.equal(f.files.get(f.path), before);
});
test('film lost save response retries original receipt and does not replay changes', async () => {
  const f = await fixture(); let first = true;
  const film = new x.FilmService(f.index, { run: async request => { const result = await f.operations.run(request); if (first) { first = false; throw Error('response lost'); } return result; } }, clock, ids, () => true);
  const draft = await film.prepare(f.source, { fields: { pingjia: '保留一次' }, progress: 'yiwancheng', body: f.source.body });
  await assert.rejects(film.execute(draft), /response lost/); const saved = f.files.get(f.path);
  await film.execute(draft); assert.equal(f.files.get(f.path), saved); assert.equal(film.get(f.source.attributes.biaoshi).attributes.pingjia, '保留一次');
});
