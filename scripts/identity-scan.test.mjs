import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services } from './verification-runtime.mjs';
async function fixture(count = 2) {
  const files = new Map(), codec = new x.MarkdownCodec();
  for (let i = 0; i < count; i++) files.set(`${layout.module('zhishi')}/test${i}.md`, codec.create(record('zhishi'), 'body'));
  let active = 0, peak = 0, writes = 0, failure;
  const fs = { list: async () => [...files.keys()], read: async p => {
    active++; peak = Math.max(peak, active);
    try { await new Promise(r => setTimeout(r, 1)); if (p === failure) throw new x.StoreError('io', 'unreadable'); return files.get(p); }
    finally { active--; }
  }, process: async (p, fn) => { assert.equal(active, 0); writes++; const raw = fn(files.get(p)); files.set(p, raw); return raw; }, create: async () => { throw Error('unexpected'); } };
  const s = services(fs); await s.index.rebuild();
  const own = [...files.keys()][0], snapshot = s.index.snapshots().find(e => e.path === own);
  return { files, s, own, snapshot, fail: p => { failure = p; }, stats: () => ({ active, peak, writes }) };
}
test('warm cache still detects same-length external duplicate without index events', async () => {
  const f = await fixture(), other = [...f.files.keys()][1];
  const attributes = f.s.index.snapshots().find(e => e.path === other).attributes;
  const raw = f.files.get(other); f.files.set(other, new x.MarkdownCodec().update(raw, { ...attributes, biaoshi: f.snapshot.attributes.biaoshi }, 'body'));
  assert.equal(f.files.get(other).length, raw.length);
  await assert.rejects(f.s.notes.update(f.snapshot.version, { body: 'new' }), e => e.code === 'duplicate_id');
  assert.equal(f.stats().writes, 0);
});
test('warm cache never hides malformed or unreadable authoritative files', async () => {
  for (const mode of ['malformed', 'io']) {
    const f = await fixture(), other = [...f.files.keys()][1];
    if (mode === 'malformed') f.files.set(other, '---\na: [\n---\n'); else f.fail(other);
    await assert.rejects(f.s.notes.update(f.snapshot.version, { body: 'new' }), e => e.code === (mode === 'io' ? 'io' : 'invalid_format'));
    assert.equal(f.stats().writes, 0);
  }
});
test('bounded fresh reads all settle before mutation and preserve source version protection', async () => {
  const f = await fixture(110);
  await f.s.notes.update(f.snapshot.version, { body: 'new' });
  assert.ok(f.stats().peak > 1 && f.stats().peak <= 50);
  assert.equal(f.stats().active, 0);
  await assert.rejects(f.s.notes.update(f.snapshot.version, { body: 'stale' }), e => e.code === 'conflict');
});
test('new renamed duplicate is checked and removed file is no longer scanned', async () => {
  const f = await fixture(), other = [...f.files.keys()][1];
  f.files.delete(other); const renamed = `${layout.module('zhishi')}/renamed.md`;
  f.files.set(renamed, f.files.get(f.own));
  await assert.rejects(f.s.notes.update(f.snapshot.version, { body: 'new' }), e => e.code === 'duplicate_id');
  f.files.delete(renamed);
  await f.s.notes.update(f.snapshot.version, { body: 'new' });
});
