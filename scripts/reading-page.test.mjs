import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ['src/ui/ReadingPage.tsx'], bundle: true, format: 'cjs', platform: 'browser', external: ['react', 'react/jsx-runtime'], write: false });
function fixture(editor = false) {
  const states = []; let cursor = 0, created = 0, opened, query, submitted, closed = 0;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = typeof initial === 'function' ? initial() : initial; return [states[n], v => { states[n] = typeof v === 'function' ? v(states[n]) : v; }]; }, useRef: v => ({ current: v }), useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: n => n === 'react' ? fake : require(n) });
  const source = { path: '阅读/测试书.md', version: { original: 'raw' }, body: '<script>长正文</script>', attributes: { biaoshi: 'book', zhuangtai: 'yiwancheng', biaoqian: ['文学'], duwanshijian: '2026-10-11T01:00:00Z' } };
  const service = { subscribe: () => () => {}, list: (...q) => { query = q; return { ready: true, total: 1, issues: 0, page: 1, pages: 1, items: [source] }; }, prepare: async (s, e) => { submitted = e; return {}; }, execute: async () => {} };
  const port = { service, create: () => created++, open: id => { opened = id; } };
  const render = () => { cursor = 0; return editor ? module.exports.ReadingEditor({ source, service, close: () => closed++ }) : module.exports.ReadingPage({ port }); };
  const walk = n => !n || typeof n !== 'object' ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  return { nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ created, opened, query, submitted, closed }) };
}
test('reading page routes create/open and filters author, progress and tags', () => {
  const f = fixture(); assert.match(f.html(), /阅读工作台/);
  f.nodes().find(n => n.props.children === '新建阅读笔记').props.onClick(); f.nodes().find(n => n.props.children === '打开原笔记').props.onClick();
  f.nodes().find(n => n.type === 'input').props.onChange({ target: { value: '作者' } }); f.nodes().find(n => n.type === 'select').props.onChange({ target: { value: 'jinxingzhong' } }); f.nodes();
  assert.equal(f.stats().created, 1); assert.equal(f.stats().opened, 'book'); assert.deepEqual(f.stats().query.slice(0, 2), ['作者', 'jinxingzhong']);
});
test('editor uses native tags and datetimes, clearing finish on reopen and saving literal body', async () => {
  const f = fixture(true); const html = f.html(); assert.match(html, /datetime-local/); assert.match(html, /tags/); assert.match(html, /&lt;script&gt;/);
  f.nodes().find(n => n.type === 'select').props.onChange({ target: { value: 'jinxingzhong' } }); f.nodes().find(n => n.props.children === '保存阅读').props.onClick();
  await new Promise(r => setTimeout(r, 0)); assert.equal(f.stats().submitted.fields.duwanshijian, ''); assert.equal(f.stats().submitted.progress, 'jinxingzhong'); assert.equal(f.stats().submitted.body, '<script>长正文</script>'); assert.equal(f.stats().closed, 1);
});
