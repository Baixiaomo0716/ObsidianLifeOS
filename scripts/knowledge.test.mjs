import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services, clock, ids } from './verification-runtime.mjs';
async function fixture(extra = {}) {
  const files = new Map(), fs = { list: async () => [...files.keys()], read: async p => { if (!files.has(p)) throw new x.StoreError('not_found', 'missing'); return files.get(p); }, create: async (p, raw) => { if (files.has(p)) throw new x.StoreError('already_exists', 'exists'); files.set(p, raw); }, process: async (p, fn) => { const raw = fn(await fs.read(p)); files.set(p, raw); return raw; } };
  const s = services(fs), path = `${layout.module('zhishi')}/测试知识.md`;
  await s.notes.create(path, record('zhishi', undefined, { extra: { keep: true }, ...extra }), '自由正文\n'); await s.index.rebuild();
  const knowledge = new x.KnowledgeService(s.index, s.operations, clock, ids, () => true);
  return { ...s, knowledge, files, path, source: knowledge.list().items[0] };
}
test('knowledge content/tags and Markdown wiki links survive editing with unknown fields intact', async () => {
  const f = await fixture(), body = '# 知识\n[[另一笔记|别名]]\n![[附件.png]]\n' + '字'.repeat(900), fields = { neirong: '内容摘要', biaoqian: ['学习', '知识'] };
  await f.knowledge.execute(await f.knowledge.prepare(f.source, { fields, progress: 'jinxingzhong', body })); const saved = f.knowledge.get(f.source.attributes.biaoshi);
  assert.equal(saved.body, body); assert.equal(saved.attributes.neirong, fields.neirong); assert.deepEqual(saved.attributes.biaoqian, fields.biaoqian); assert.deepEqual(saved.attributes.extra, { keep: true });
  const raw = f.files.get(f.path); assert.match(raw, /内容: "内容摘要"/); assert.match(raw, /tags:/); assert.doesNotMatch(raw, /\n(?:标识|名称|来源|类型):/); assert.equal(f.summary.read().ongoing.length, 1);
});
test('knowledge completion/reopen updates home and valid diary/task incoming relations', async () => {
  const f = await fixture(), id = f.source.attributes.biaoshi;
  await f.notes.create(`${layout.module('riji')}/2026-10-12.md`, record('riji', undefined, { guanlian: [id] }), '');
  await f.notes.create(`${layout.module('daiban')}/学习.md`, record('daiban', undefined, { guanlian: [id] }), ''); await f.index.rebuild();
  await f.knowledge.execute(await f.knowledge.prepare(f.source, { fields: {}, progress: 'yiwancheng', body: f.source.body })); const done = f.knowledge.get(id); assert.equal(done.attributes.wanchengshijian, clock.now()); assert.equal(f.knowledge.incoming(id).length, 2);
  await f.knowledge.execute(await f.knowledge.prepare(done, { fields: {}, progress: 'jinxingzhong', body: done.body })); assert.equal(f.knowledge.get(id).attributes.wanchengshijian, undefined); assert.equal(f.summary.read().ongoing.length, 1);
  const incoming = f.knowledge.incoming(id), path = incoming[0].path; f.files.set(path.replace('.md', '-副本.md'), f.files.get(path)); await f.index.rebuild(); assert.equal(f.knowledge.incoming(id).length, 1);
});
test('knowledge rejects malformed tags, reserved fields and invalid progress without mutation', async () => {
  const f = await fixture(), before = f.files.get(f.path);
  for (const fields of [{ biaoqian: 'tag' }, { neirong: 123 }, { biaoshi: ids.next() }, { laiyuan: '来源' }]) await assert.rejects(f.knowledge.prepare(f.source, { fields, progress: 'weikaishi', body: '' }));
  await assert.rejects(f.knowledge.prepare(f.source, { fields: {}, progress: 'bad', body: '' })); assert.equal(f.files.get(f.path), before);
});
test('knowledge external changes protected, repeated execution idempotent and failed response retriable', async () => {
  const f = await fixture(), input = { fields: { neirong: '新内容' }, progress: 'weikaishi', body: f.source.body };
  const draft = await f.knowledge.prepare(f.source, input); f.files.set(f.path, f.files.get(f.path) + '\n外部修改'); await assert.rejects(f.knowledge.execute(draft), /已变化/); await f.index.rebuild();
  let first = true; const service = new x.KnowledgeService(f.index, { run: async r => { const result = await f.operations.run(r); if (first) { first = false; throw Error('response lost'); } return result; } }, clock, ids, () => true);
  const current = service.get(f.source.attributes.biaoshi), next = await service.prepare(current, { ...input, body: current.body }); await assert.rejects(service.execute(next), /response lost/);
  const saved = f.files.get(f.path); await Promise.all([service.execute(next), service.execute(next)]); assert.equal(f.files.get(f.path), saved); assert.match(saved, /外部修改/);
});
test('knowledge search matches content/body/tags, paginates and excludes duplicate identities', async () => {
  const f = await fixture({ neirong: '独特内容', biaoqian: ['学习'] }); assert.equal(f.knowledge.list('独特内容', 'weikaishi', '#学习').total, 1);
  const codec = new x.MarkdownCodec(); for (let n = 0; n < 51; n++) f.files.set(`${layout.module('zhishi')}/知识${n}.md`, codec.create(record('zhishi'), ''));
  f.files.set(`${layout.module('youxi')}/游戏.md`, codec.create(record('youxi'), '')); await f.index.rebuild(); assert.equal(f.knowledge.list().total, 52); assert.equal(f.knowledge.list().items.length, 50); assert.equal(f.knowledge.list('', '', '', 2).items.length, 2);
  f.files.set(`${layout.module('zhishi')}/副本.md`, f.files.get(f.path)); await f.index.rebuild(); assert.equal(f.knowledge.list('独特内容').total, 0); assert.equal(f.knowledge.incoming(f.source.attributes.biaoshi).length, 0);
});
test('knowledge optional content clears, no-op preserves raw text and stopped service refuses edits', async () => {
  const f = await fixture({ neirong: '旧内容' }); await f.knowledge.execute(await f.knowledge.prepare(f.source, { fields: { neirong: '' }, progress: 'weikaishi', body: f.source.body }));
  const saved = f.knowledge.get(f.source.attributes.biaoshi); assert.equal(saved.attributes.neirong, undefined); assert.equal(saved.body, f.source.body); const before = f.files.get(f.path);
  await f.knowledge.execute(await f.knowledge.prepare(saved, { fields: {}, progress: 'weikaishi', body: saved.body })); assert.equal(f.files.get(f.path), before);
  const stopped = new x.KnowledgeService(f.index, f.operations, clock, ids, () => false); await assert.rejects(stopped.prepare(saved, { fields: {}, progress: 'weikaishi', body: '' }), /停止/);
});
