import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ['src/ui/PerformancePage.tsx'], bundle: true, format: 'cjs', platform: 'browser', external: ['react', 'react/jsx-runtime'], write: false });
function fixture(editor = false) {
  const states = []; let cursor = 0, created = 0, opened, query, submitted, closed = 0;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = typeof initial === 'function' ? initial() : initial; return [states[n], v => { states[n] = typeof v === 'function' ? v(states[n]) : v; }]; }, useRef: v => ({ current: v }), useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: n => n === 'react' ? fake : require(n) });
  const source = { path: '演出/测试演出.md', version: { original: 'raw' }, body: '<script>正文</script>', attributes: { biaoshi: 'performance', jindu: 'yiwancheng', biaoqian: ['电影'], yueduimingcheng: ['乐队甲'], didian: ['地点甲'], leixing: '音乐节', shijian: '2026-10-11T01:00:00Z' } };
  const service = { subscribe: () => () => {}, list: (...q) => { query = q; return { ready: true, total: 1, issues: 0, page: 1, pages: 1, items: [source] }; }, prepare: async (s, e) => { submitted = e; return {}; }, execute: async () => {} };
  const port = { service, create: () => created++, open: id => { opened = id; } };
  const render = () => { cursor = 0; return editor ? module.exports.PerformanceEditor({ source, service, close: () => closed++ }) : module.exports.PerformancePage({ port }); };
  const walk = n => !n || typeof n !== 'object' ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  return { nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ created, opened, query, submitted, closed }) };
}
test('performance page routes native creation/open and distinct type/progress filtering', () => {
  const f = fixture(); assert.match(f.html(), /演出工作台/);
  f.nodes().find(n => n.props.children === '新建演出笔记').props.onClick(); f.nodes().find(n => n.props.children === '打开原笔记').props.onClick();
  f.nodes().filter(n => n.type === 'input')[1].props.onChange({ target: { value: '乐队' } }); f.nodes().filter(n => n.type === 'input')[0].props.onChange({ target: { value: '话剧' } }); f.nodes();
  assert.equal(f.stats().created, 1); assert.equal(f.stats().opened, 'performance'); assert.equal(f.stats().query[0], '乐队'); assert.equal(f.stats().query[4], '话剧');
});
test('performance editor converts band lists, distinguishes dates/time and keeps event time on reopen', async () => {
  const f = fixture(true), html = f.html(); assert.match(html, /datetime-local/); assert.match(html, /评分/); assert.match(html, /&lt;script&gt;/);
  f.nodes().filter(n => n.type === 'textarea')[0].props.onChange({ target: { value: '乐队甲\n乐队乙\n乐队甲' } });
  f.nodes().find(n => n.type === 'select').props.onChange({ target: { value: 'jinxingzhong' } }); f.nodes().find(n => n.props.children === '保存演出').props.onClick();
  await new Promise(r => setTimeout(r, 0)); assert.equal(f.stats().submitted.fields.yueduimingcheng.join(','), '乐队甲,乐队乙'); assert.equal(f.stats().submitted.fields.shijian, '2026-10-11T01:00:00.000Z'); assert.equal(f.stats().submitted.body, '<script>正文</script>'); assert.equal(f.stats().closed, 1);
});
