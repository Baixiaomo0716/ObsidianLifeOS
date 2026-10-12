import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ['src/ui/FilmPage.tsx'], bundle: true, format: 'cjs', platform: 'browser', external: ['react', 'react/jsx-runtime'], write: false });
function fixture(editor = false) {
  const states = []; let cursor = 0, created = 0, opened, query, submitted, closed = 0;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = typeof initial === 'function' ? initial() : initial; return [states[n], v => { states[n] = typeof v === 'function' ? v(states[n]) : v; }]; }, useRef: v => ({ current: v }), useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: n => n === 'react' ? fake : require(n) });
  const source = { path: '影视/测试影片.md', version: { original: 'raw' }, body: '<script>正文</script>', attributes: { biaoshi: 'film', jindu: 'yiwancheng', biaoqian: ['电影'], daoyan: ['导演甲'], zhuyan: ['主演甲'], leixing: 'dianying', guankanshijian: '2026-10-11T01:00:00Z' } };
  const service = { subscribe: () => () => {}, list: (...q) => { query = q; return { ready: true, total: 1, issues: 0, page: 1, pages: 1, items: [source] }; }, prepare: async (s, e) => { submitted = e; return {}; }, execute: async () => {} };
  const port = { service, create: () => created++, open: id => { opened = id; } };
  const render = () => { cursor = 0; return editor ? module.exports.FilmEditor({ source, service, close: () => closed++ }) : module.exports.FilmPage({ port }); };
  const walk = n => !n || typeof n !== 'object' ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  return { nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ created, opened, query, submitted, closed }) };
}
test('film page routes native creation/open and distinct type/progress filtering', () => {
  const f = fixture(); assert.match(f.html(), /影视工作台/);
  f.nodes().find(n => n.props.children === '新建影视笔记').props.onClick(); f.nodes().find(n => n.props.children === '打开原笔记').props.onClick();
  f.nodes().find(n => n.type === 'input').props.onChange({ target: { value: '导演' } }); f.nodes().filter(n => n.type === 'select')[1].props.onChange({ target: { value: 'dianshiju' } }); f.nodes();
  assert.equal(f.stats().created, 1); assert.equal(f.stats().opened, 'film'); assert.equal(f.stats().query[0], '导演'); assert.equal(f.stats().query[4], 'dianshiju');
});
test('film editor converts people lists, distinguishes dates/time and keeps viewing time on reopen', async () => {
  const f = fixture(true), html = f.html(); assert.match(html, /type="date"/); assert.match(html, /datetime-local/); assert.match(html, /豆瓣评分/); assert.match(html, /&lt;script&gt;/);
  f.nodes().filter(n => n.type === 'textarea')[0].props.onChange({ target: { value: '导演甲\n导演乙\n导演甲' } });
  f.nodes().find(n => n.type === 'select').props.onChange({ target: { value: 'jinxingzhong' } }); f.nodes().find(n => n.props.children === '保存影视').props.onClick();
  await new Promise(r => setTimeout(r, 0)); assert.equal(f.stats().submitted.fields.daoyan.join(','), '导演甲,导演乙'); assert.equal(f.stats().submitted.fields.guankanshijian, '2026-10-11T01:00:00.000Z'); assert.equal(f.stats().submitted.body, '<script>正文</script>'); assert.equal(f.stats().closed, 1);
});
