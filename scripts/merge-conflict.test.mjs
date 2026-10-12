import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, services, layout } from './verification-runtime.mjs';
test('complete Git conflicts in Markdown body, YAML and diff3 refuse decode and index without changing bytes', async () => {
  for (const eol of ['\n','\r\n']) {
    const codec = new x.MarkdownCodec(), block = ['<<<<<<< HEAD','ours','||||||| base','ancestor','=======','theirs','>>>>>>> other'].join(eol), raw = codec.create(record('zhishi'), '# 正文\n') + block + eol, file = `${layout.module('zhishi')}/冲突.md`, files = new Map([[file,raw]]), fs = { list: async () => [file], read: async p => files.get(p), create: async () => { throw Error('no writes'); }, process: async () => { throw Error('no writes'); } };
    assert.throws(() => codec.decode(raw), /Git冲突/); assert.throws(() => codec.update(raw, record('zhishi'), 'new'), /Git冲突/); const s = services(fs); await s.index.rebuild(); assert.equal(s.index.all().length,0); assert.equal(s.index.issues().length,1); assert.equal(files.get(file),raw);
    assert.throws(() => codec.decode('---'+eol+block+eol+'---'+eol), /Git冲突/);
  }
});
test('single marker and ordinary mentions remain editable; completed example blocks require manual disambiguation', () => {
  const codec = new x.MarkdownCodec(), a = record('zhishi'); for (const body of ['# Git教程\n提到 <<<<<<< HEAD 与 =======','<<<<<<< HEAD\n单独标记','=======\n正文\n>>>>>>> topic']) assert.equal(codec.decode(codec.create(a,body)).body,body);
});