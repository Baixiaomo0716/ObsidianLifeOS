import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services, clock, ids } from './verification-runtime.mjs';
const types = ['yuedu', 'yingshi', 'youxi', 'yanchu', 'lvxing', 'daiban', 'xiangmu'];
async function fixture() {
  const files = new Map(), codec = new x.MarkdownCodec(), projectId = ids.next(), sources = new Map();
  for (const type of types) {
    const id = type === 'xiangmu' ? projectId : ids.next(), extra = { [type === 'yuedu' ? 'zhuangtai' : 'jindu']: 'jinxingzhong', extra: { preserved: type }, ...(type === 'daiban' ? { guanlian: [projectId] } : {}) };
    const path = `${layout.module(type)}/${type}.md`; files.set(path, codec.create(record(type, id, extra), `正文:${type}`)); sources.set(type, { id, path });
  }
  const diaryId = ids.next(); files.set(`${layout.module('riji')}/2026-10-12.md`, codec.create(record('riji', diaryId, { guanlian: [...sources.values()].map(s => s.id) }), '日记原文'));
  const fs = { list: async () => [...files.keys()], read: async p => { if (!files.has(p)) throw new x.StoreError('not_found', 'missing'); return files.get(p); }, create: async (p, raw) => { if (files.has(p)) throw new x.StoreError('already_exists', 'exists'); files.set(p, raw); }, process: async (p, fn) => { const raw = fn(await fs.read(p)); files.set(p, raw); return raw; } };
  const s = services(fs); await s.index.rebuild();
  const modules = new Map([['yuedu', new x.ReadingService(s.index, s.operations, clock, ids, () => true)], ['yingshi', new x.FilmService(s.index, s.operations, clock, ids, () => true)], ['youxi', new x.GameService(s.index, s.operations, clock, ids, () => true)], ['yanchu', new x.PerformanceService(s.index, s.operations, clock, ids, () => true)], ['lvxing', new x.TravelService(s.index, s.operations, clock, ids, () => true)]]);
  return { ...s, files, fs, sources, modules, diaryId };
}
test('seven progress types share home and diary identities through five dedicated completion/reopen flows', async () => {
  const f = await fixture(); assert.equal(f.summary.read().ongoing.length, 7); assert.equal(f.search.relations(f.diaryId).outgoing.length, 7); assert.equal(f.projects.board().total, 1);
  for (const [type, service] of f.modules) {
    const source = service.get(f.sources.get(type).id); await service.execute(await service.prepare(source, { fields: { pingjia: `${type}评价` }, progress: 'yiwancheng', body: source.body }));
    const done = service.get(source.attributes.biaoshi); assert.equal(done.attributes.wanchengshijian, clock.now()); assert.equal(f.search.relations(source.attributes.biaoshi).incoming.length, 1);
    assert.deepEqual(done.attributes.extra, { preserved: type }); assert.equal(done.body, source.body);
  }
  assert.equal(f.summary.read().ongoing.length, 2);
  for (const [type, service] of f.modules) {
    const done = service.get(f.sources.get(type).id); await service.execute(await service.prepare(done, { fields: {}, progress: 'jinxingzhong', body: done.body }));
  }
  assert.equal(f.summary.read().ongoing.length, 7); const detail = f.projects.detail(f.sources.get('xiangmu').id); assert.equal(detail.tasks.length, 1); assert.equal(detail.ratio, 0);
  const restored = services(f.fs); await restored.index.rebuild(); assert.equal(restored.summary.read().ongoing.length, 7); assert.equal(restored.search.relations(f.diaryId).outgoing.filter(r => r.target).length, 7);
});
test('mixed P2 duplicate identity excluded consistently without changing source files', async () => {
  const f = await fixture(), source = f.sources.get('yuedu'), original = f.files.get(source.path); f.files.set(`${layout.module('yuedu')}/副本.md`, original);
  const before = [...f.files]; await f.index.rebuild(); assert.equal(f.summary.read().ongoing.length, 6); assert.equal(f.modules.get('yuedu').list().total, 0);
  assert.equal(f.search.relations(f.diaryId).outgoing.find(r => r.id === source.id).target, undefined); assert.deepEqual([...f.files], before);
});
test('P2 body Git conflict remains disputed and blocks business writes with persisted failure receipt', async () => {
  const f = await fixture(), game = f.sources.get('youxi'); f.files.set(game.path, f.files.get(game.path) + '\n<<<<<<< local\n本地\n=======\n远端\n>>>>>>> remote\n'); await f.index.rebuild();
  assert.equal(f.summary.read().ongoing.length, 6); assert.equal(f.modules.get('youxi').get(game.id), undefined);
  const service = f.modules.get('lvxing'), source = service.get(f.sources.get('lvxing').id), draft = await service.prepare(source, { fields: { pingjia: '暂停写入' }, progress: 'jinxingzhong', body: source.body }), before = [...f.files];
  await assert.rejects(service.execute(draft), e => e.code === 'invalid_format');
  assert.deepEqual([...f.files].filter(([p]) => layout.isManaged(p)), before.filter(([p]) => layout.isManaged(p)));
  const receipts = [...f.files].filter(([p]) => p.includes('/operations/')).map(([, raw]) => JSON.parse(raw));
  assert.equal(receipts.length, 1); assert.equal(receipts[0].cuowu.leixing, 'invalid_format');
});
