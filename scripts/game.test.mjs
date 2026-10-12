import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services, clock, ids } from './verification-runtime.mjs';
async function fixture(extra = {}) {
  const files = new Map(), fs = { list: async () => [...files.keys()], read: async p => { if (!files.has(p)) throw new x.StoreError('not_found', 'missing'); return files.get(p); }, create: async (p, raw) => { if (files.has(p)) throw new x.StoreError('already_exists', 'exists'); files.set(p, raw); }, process: async (p, fn) => { const raw = fn(await fs.read(p)); files.set(p, raw); return raw; } };
  const s = services(fs), path = `${layout.module('youxi')}/测试游戏.md`;
  await s.notes.create(path, record('youxi', undefined, { extra: { keep: true }, ...extra }), '自由正文\n'); await s.index.rebuild();
  const game = new x.GameService(s.index, s.operations, clock, ids, () => true);
  return { ...s, game, files, path, source: game.list().items[0] };
}
test('game fields preserve Chinese Markdown, date-only release and unlimited body', async () => {
  const f = await fixture(), fields = { leixing: '角色扮演', jianjie: '游戏简介', faxingshijian: '2020-02-29', pingjia: '游玩感想', biaoqian: ['游戏'] };
  await f.game.execute(await f.game.prepare(f.source, { fields, progress: 'jinxingzhong', body: '字'.repeat(700) }));
  const saved = f.game.get(f.source.attributes.biaoshi);
  for (const [k, v] of Object.entries(fields)) assert.deepEqual(saved.attributes[k], v);
  assert.deepEqual(saved.attributes.extra, { keep: true }); assert.equal(saved.body.length, 700);
  const raw = f.files.get(f.path); assert.match(raw, /发行时间: "2020-02-29"/); assert.match(raw, /tags:/); assert.match(raw, /进度:\n\s+- 进行中/); assert.doesNotMatch(raw, /\n(?:标识|名称|时长|次数):/);
});
test('game progress completion and reopen update home, search and diary relation', async () => {
  const f = await fixture();
  await f.notes.create(`${layout.module('riji')}/2026-10-12.md`, record('riji', undefined, { guanlian: [f.source.attributes.biaoshi] }), ''); await f.index.rebuild();
  await f.game.execute(await f.game.prepare(f.source, { fields: {}, progress: 'yiwancheng', body: f.source.body }));
  const done = f.game.get(f.source.attributes.biaoshi); assert.equal(done.attributes.wanchengshijian, clock.now()); assert.equal(f.summary.read().ongoing.length, 0);
  await f.game.execute(await f.game.prepare(done, { fields: {}, progress: 'jinxingzhong', body: done.body }));
  const saved = f.game.get(done.attributes.biaoshi); assert.equal(saved.attributes.wanchengshijian, undefined); assert.equal(f.summary.read().ongoing.length, 1);
  assert.equal(f.search.query({ type: 'youxi', progress: 'jinxingzhong' }).total, 1); assert.equal(f.search.relations(saved.attributes.biaoshi).incoming.length, 1);
});
test('game invalid release dates, progress, fields and identity edits never write', async () => {
  const f = await fixture(), before = f.files.get(f.path);
  for (const fields of [{ faxingshijian: '2023-02-29' }, { faxingshijian: '2026-01-01T00:00:00Z' }, { leixing: ['RPG'] }, { biaoqian: 'tag' }, { biaoshi: ids.next() }, { shichang: 100 }]) await assert.rejects(f.game.prepare(f.source, { fields, progress: 'weikaishi', body: '' }));
  await assert.rejects(f.game.prepare(f.source, { fields: {}, progress: 'bad', body: '' })); assert.equal(f.files.get(f.path), before);
});
test('game conflict refuses external changes and repeated request remains idempotent', async () => {
  const f = await fixture(), edit = { fields: { pingjia: '评价' }, progress: 'weikaishi', body: f.source.body };
  const draft = await f.game.prepare(f.source, edit); f.files.set(f.path, f.files.get(f.path) + '\n外部修改');
  await assert.rejects(f.game.execute(draft), /已变化/); await f.index.rebuild();
  const current = f.game.get(f.source.attributes.biaoshi), next = await f.game.prepare(current, { ...edit, body: current.body });
  await Promise.all([f.game.execute(next), f.game.execute(next)]); const once = f.files.get(f.path); await f.game.execute(next); assert.equal(f.files.get(f.path), once); assert.match(once, /外部修改/);
});
test('game search filters arbitrary type, tags, progress and pages, excludes disputes', async () => {
  const f = await fixture({ leixing: '角色扮演', jianjie: '独特简介', biaoqian: ['游戏'], jindu: 'jinxingzhong' });
  assert.equal(f.game.list('独特简介', 'jinxingzhong', '#游戏', 1, '角色扮演').total, 1); assert.equal(f.game.list('', '', '', 1, '动作').total, 0);
  const codec = new x.MarkdownCodec(); for (let n = 0; n < 51; n++) f.files.set(`${layout.module('youxi')}/游戏${n}.md`, codec.create(record('youxi'), ''));
  f.files.set(`${layout.module('yuedu')}/阅读.md`, codec.create(record('yuedu'), '')); await f.index.rebuild();
  assert.equal(f.game.list().total, 52); assert.equal(f.game.list().items.length, 50); assert.equal(f.game.list('', '', '', 2).items.length, 2);
  f.files.set(`${layout.module('youxi')}/副本.md`, f.files.get(f.path)); await f.index.rebuild(); assert.equal(f.game.list('独特简介').total, 0);
});
test('game optional clearing and no-op preserve raw body, stopped service refuses writes', async () => {
  const f = await fixture({ jianjie: '旧简介', faxingshijian: '2020-01-01' });
  await f.game.execute(await f.game.prepare(f.source, { fields: { jianjie: '', faxingshijian: '' }, progress: 'weikaishi', body: f.source.body }));
  const saved = f.game.get(f.source.attributes.biaoshi); assert.equal(saved.attributes.jianjie, undefined); assert.equal(saved.attributes.faxingshijian, undefined);
  const before = f.files.get(f.path); await f.game.execute(await f.game.prepare(saved, { fields: {}, progress: 'weikaishi', body: saved.body })); assert.equal(f.files.get(f.path), before);
  const stopped = new x.GameService(f.index, f.operations, clock, ids, () => false); await assert.rejects(stopped.prepare(saved, { fields: {}, progress: 'weikaishi', body: '' }), /停止/);
});
test('game lost response retries original receipt without duplicating writes', async () => {
  const f = await fixture(); let first = true;
  const game = new x.GameService(f.index, { run: async request => { const result = await f.operations.run(request); if (first) { first = false; throw Error('response lost'); } return result; } }, clock, ids, () => true);
  const draft = await game.prepare(f.source, { fields: { pingjia: '保留一次' }, progress: 'yiwancheng', body: f.source.body });
  await assert.rejects(game.execute(draft), /response lost/); const saved = f.files.get(f.path); await game.execute(draft); assert.equal(f.files.get(f.path), saved);
});
