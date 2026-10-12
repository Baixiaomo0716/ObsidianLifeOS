import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services, clock } from './verification-runtime.mjs';
async function fixture(allowed = x.shiti, zone = 'Asia/Shanghai', ready = true) {
  const files = new Map(), md = new x.MarkdownCodec(), json = new x.JsonCodec();
  const fs = { list: async () => [...files.keys()], read: async p => files.get(p), create: async () => { throw Error('readonly'); }, process: async () => { throw Error('readonly'); } };
  const add = (type, extra = {}, body = '') => { const a = record(type, undefined, extra), path = type === 'jizhang' ? layout.ledgerPath(a.biaoshi) : `${layout.module(type)}/${a.biaoshi}.md`; files.set(path, (type === 'jizhang' ? json : md).create(a, body)); return { a, path }; };
  const s = services(fs); if (ready) await s.index.rebuild();
  return { ...s, files, add, review: new x.PeriodReviewService(s.index, clock, zone, allowed) };
}
const done = type => ({ [type === 'yuedu' ? 'zhuangtai' : 'jindu']: 'yiwancheng', wanchengshijian: clock.now(), ...(type === 'yuedu' ? { duwanshijian: clock.now() } : {}) });
test('period ranges validate leap centuries and four digit years', () => {
  for (const [p, end] of [['2024-02','29'], ['1900-02','28'], ['2000-02','29'], ['0099-02','28']]) assert.equal(x.periodRange(p).to, `${p}-${end}`);
  assert.deepEqual(x.periodRange('2026'), { from: '2026-01-01', to: '2026-12-31' });
  for (const p of ['', '0000', '2026-13', '2026-00', '26', '2026-2', '2026-10-12']) assert.throws(() => x.periodRange(p));
});
test('all ten entities integrate, knowledge deduplicates and relations survive read and reload', async () => {
  const f = await fixture(), entries = x.shiti.filter(t => t !== 'riji').map(t => f.add(t, t === 'jizhang' ? {} : done(t)));
  const diary = f.add('riji', { guanlian: entries.map(e => e.a.biaoshi) }, '[[原生双链]]'); await f.index.rebuild();
  const before = [...f.files], result = f.review.read('2026-10'); assert.equal(result.total, 10); assert.equal(result.metrics.length, 11); assert.ok(result.metrics.every(m => m.total === 1));
  assert.equal(result.items.find(i => i.type === 'zhishi').bases.length, 2); assert.deepEqual(result.totals, { shouru: 0, zhichu: 1250, jieyu: -1250 });
  const fresh = services({ list: async () => [...f.files.keys()], read: async p => f.files.get(p) }); await fresh.index.rebuild();
  assert.equal(new x.PeriodReviewService(fresh.index, clock, 'Asia/Shanghai', x.shiti).read('2026').total, 10); assert.deepEqual([...f.files], before);
  assert.equal(new x.MarkdownCodec().decode(f.files.get(diary.path)).attributes.guanlian.length, 9);
});
test('completion uses configured timezone while ledger and diary retain record date', async () => {
  const f = await fixture(); f.add('youxi', { ...done('youxi'), wanchengshijian: '2026-09-30T16:00:00Z' }); f.add('riji', { riqi: '2026-09-30' }); f.add('jizhang', { riqi: '2026-09-30' }); await f.index.rebuild();
  assert.equal(f.review.read('2026-10').total, 1); assert.equal(f.review.read('2026-09').total, 2);
  const utc = new x.PeriodReviewService(f.index, clock, 'UTC', x.shiti); assert.equal(utc.read('2026-09').total, 3); assert.equal(utc.read('2026-10').total, 0);
});
test('archived completion remains historical but cancelled and reopened records do not count', async () => {
  const f = await fixture(); f.add('youxi', { ...done('youxi'), yiguidang: true }); f.add('youxi', { ...done('youxi'), yiquxiao: true }); f.add('youxi', { jindu: 'jinxingzhong' }); await f.index.rebuild();
  assert.equal(f.review.read('2026-10', 'youxi:wanchengshijian').total, 1);
});
test('money is exact and overflow never produces a false zero', async () => {
  const f = await fixture(); f.add('jizhang', { shouzhi: 'shouru', jine: 123 }); f.add('jizhang', { jine: 124 }); await f.index.rebuild(); assert.deepEqual(f.review.read('2026-10').totals, { shouru: 123, zhichu: 124, jieyu: -1 });
  f.add('jizhang', { shouzhi: 'shouru', jine: Number.MAX_SAFE_INTEGER }); await f.index.rebuild(); const r = f.review.read('2026-10'); assert.ok(r.moneyError); assert.equal(r.totals, undefined); assert.equal(r.total, 3);
});
test('unready invalid and disabled scopes do not report fabricated money', async () => {
  const f = await fixture([], 'Asia/Shanghai', false); assert.equal(f.review.read('2026-10').ready, false); assert.equal(f.review.read('bad').totals, undefined); assert.ok(f.review.read('bad').error);
  await f.index.rebuild(); assert.equal(f.review.read('2026-10').total, 0); assert.equal(f.review.read('2026-10').totals, undefined); assert.ok(f.review.read('2026-10', 'jizhang:riqi').error);
  const normal = await fixture(); assert.deepEqual(normal.review.read('2026-10').totals, { shouru: 0, zhichu: 0, jieyu: 0 });
});
test('pagination counts the complete period and category independently', async () => {
  const f = await fixture(); for (let n = 0; n < 55; n++) f.add('zhishi', done('zhishi')); await f.index.rebuild();
  const r = f.review.read('2026-10', 'all', 2); assert.equal(r.total, 55); assert.equal(r.items.length, 5); assert.equal(r.metrics.find(m => m.key === 'zhishi:wanchengshijian').total, 55);
  assert.equal(f.review.read('2026-10', 'zhishi:chuangjianshijian', 999).page, 2); assert.equal(f.review.read('2026-09').total, 0);
});
test('recycled duplicate and conflicted files excluded without rewriting originals', async () => {
  const f = await fixture(), first = f.add('zhishi'); f.files.set(`${layout.module('zhishi')}/duplicate.md`, f.files.get(first.path)); f.add('zhishi', { yihuishou: true, huishoushijian: clock.now() }); const conflict = f.add('zhishi'); f.files.set(conflict.path, f.files.get(conflict.path) + '\n<<<<<<< ours\na\n=======\nb\n>>>>>>> theirs'); await f.index.rebuild();
  const before = [...f.files], r = f.review.read('2026-10'); assert.equal(r.total, 0); assert.ok(r.issues >= 3); assert.deepEqual([...f.files], before);
});
