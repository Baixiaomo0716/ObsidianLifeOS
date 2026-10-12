import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services, clock } from './verification-runtime.mjs';
const allowed = x.shiti;
async function fixture() {
  const files = new Map(), md = new x.MarkdownCodec(), json = new x.JsonCodec();
  const fs = { list: async () => [...files.keys()], read: async p => files.get(p), create: async () => { throw Error('readonly'); }, process: async () => { throw Error('readonly'); } };
  const add = (type, tags, extra = {}, body = '') => { const a = record(type, undefined, { biaoqian: tags, ...extra }), path = type === 'jizhang' ? layout.ledgerPath(a.biaoshi) : `${layout.module(type)}/${a.biaoshi}.md`; files.set(path, (type === 'jizhang' ? json : md).create(a, body)); return path; };
  const knowledge = add('zhishi', ['学习', 'Reading', 'reading', '#Reading', '学习/编程'], {}, '#正文标签\n[[原生双链]]');
  add('yuedu', ['学习', 'reading']); add('jizhang', ['生活']); add('youxi', ['#游戏']);
  const s = services(fs); await s.index.rebuild(); return { ...s, files, add, knowledge, md };
}
test('tag counts aggregate entire mixed scope, count case variants once per note and match queries', async () => {
  const f = await fixture(), tags = f.search.tags('all', allowed); assert.equal(tags.items.find(t => t.label.toLowerCase() === 'reading').count, 2); assert.equal(tags.items.find(t => t.label === '学习').count, 2);
  for (const tag of tags.items) assert.equal(f.search.query({ type: 'all', allowed, tag: tag.label }).total, tag.count);
  assert.ok(tags.items.some(t => t.label === '生活')); assert.ok(!tags.items.some(t => t.label === '正文标签'));
});
test('tag scope hides disabled modules, handles no modules and exact nested tags', async () => {
  const f = await fixture(); assert.equal(f.search.tags('all', ['zhishi']).items.find(t => t.label === '学习').count, 1); assert.equal(f.search.tags('jizhang', ['zhishi']).total, 0); assert.equal(f.search.tags('all', []).total, 0);
  assert.equal(f.search.query({ type: 'all', allowed, tag: '学习' }).total, 2); assert.equal(f.search.query({ type: 'all', allowed, tag: '学习/编程' }).total, 1);
});
test('invalid duplicate and recycled records never contribute tags or counts', async () => {
  const f = await fixture(); f.add('zhishi', ['回收'], { yihuishou: true, huishoushijian: clock.now() });
  f.files.set(`${layout.module('zhishi')}/坏笔记.md`, '---\na: [\n---\n'); f.files.set(`${layout.module('zhishi')}/副本.md`, f.files.get(f.knowledge)); await f.index.rebuild();
  const tags = f.search.tags('all', allowed); assert.equal(tags.items.find(t => t.label === '学习').count, 1); assert.ok(!tags.items.some(t => ['回收', '学习/编程'].includes(t.label))); assert.ok(tags.issues >= 3);
});
test('tag navigation and content use independent full-scope pagination', async () => {
  const f = await fixture(); for (let n = 0; n < 55; n++) f.add('zhishi', ['公共', `标签${n}`]); await f.index.rebuild();
  const tags = f.search.tags('zhishi', allowed); assert.equal(tags.total, 59); assert.equal(tags.items.length, 50); assert.equal(f.search.tags('zhishi', allowed, '', 2).items.length, 9);
  assert.equal(tags.items[0].label, '公共'); assert.equal(tags.items[0].count, 55); assert.equal(f.search.query({ type: 'zhishi', allowed, tag: '公共', page: 2 }).items.length, 5);
});
test('external tag modification/removal refresh counts without rewriting body or disk', async () => {
  const f = await fixture(), raw = f.files.get(f.knowledge), decoded = f.md.decode(raw); f.files.set(f.knowledge, f.md.update(raw, { ...decoded.attributes, biaoqian: ['新标签'] }, decoded.body)); await f.index.changed(f.knowledge);
  const before = [...f.files]; assert.equal(f.search.tags('zhishi', allowed).items[0].label, '新标签'); assert.equal(f.search.query({ type: 'zhishi', tag: '学习' }).total, 0); assert.deepEqual([...f.files], before);
  assert.equal(f.md.decode(f.files.get(f.knowledge)).body, decoded.body); f.files.delete(f.knowledge); await f.index.removed(f.knowledge); assert.equal(f.search.tags('zhishi', allowed).total, 0);
});
test('tag discovery waits for ready index and keyword filter clamps page', async () => {
  const fs = { list: async () => [], read: async () => '', create: async () => {}, process: async () => '' }, s = services(fs); assert.equal(s.search.tags('all', allowed).ready, false);
  const f = await fixture(), result = f.search.tags('all', allowed, '#READ', 999); assert.equal(result.page, 1); assert.equal(result.total, 1); assert.equal(result.items[0].count, 2);
});
