import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ['src/ui/TravelPage.tsx'], bundle: true, format: 'cjs', platform: 'browser', external: ['react', 'react/jsx-runtime'], write: false });
function fixture(editor = false) {
  const states = []; let cursor = 0, created = 0, opened, query, submitted, closed = 0;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = typeof initial === 'function' ? initial() : initial; return [states[n], v => { states[n] = typeof v === 'function' ? v(states[n]) : v; }]; }, useRef: v => ({ current: v }), useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: n => n === 'react' ? fake : require(n) });
  const source = { path: '旅行/测试旅行.md', version: { original: 'raw' }, body: '<script>正文</script>', attributes: { biaoshi: 'travel', jindu: 'weikaishi', biaoqian: ['旅行'], didian: ['北京'], jiaotonggongju: ['高铁'], zhusu: ['酒店'], kaishiriqi: '2020-02-29', jieshuriqi: '2020-03-01' } };
  const service = { subscribe: () => () => {}, list: (...q) => { query = q; return { ready: true, total: 1, issues: 0, page: 1, pages: 1, items: [source] }; }, prepare: async (s, e) => { submitted = e; return {}; }, execute: async () => {} };
  const port = { service, create: () => created++, open: id => { opened = id; } };
  const render = () => { cursor = 0; return editor ? module.exports.TravelEditor({ source, service, close: () => closed++ }) : module.exports.TravelPage({ port }); };
  const walk = n => !n || typeof n !== 'object' ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  return { nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ created, opened, query, submitted, closed }) };
}
test('travel page uses template creation, native opening and search/progress filters', () => {
  const f = fixture(); assert.match(f.html(), /旅行工作台/);
  f.nodes().find(n => n.props.children === '新建旅行笔记').props.onClick(); f.nodes().find(n => n.props.children === '打开原笔记').props.onClick();
  f.nodes().filter(n => n.type === 'input')[0].props.onChange({ target: { value: '北京' } }); f.nodes().find(n => n.type === 'select').props.onChange({ target: { value: 'jinxingzhong' } }); f.nodes();
  assert.equal(f.stats().created, 1); assert.equal(f.stats().opened, 'travel'); assert.equal(f.stats().query[1], 'jinxingzhong'); assert.equal(f.stats().query[0], '北京');
});
test('travel editor preserves date-only itinerary, deduplicates tags and saves literal body', async () => {
  const f = fixture(true), html = f.html(); assert.match(html, /type="date"/); assert.doesNotMatch(html, /datetime-local|时长|次数|评分/); assert.match(html, /&lt;script&gt;/);
  f.nodes().filter(n => n.type === 'textarea')[4].props.onChange({ target: { value: '旅行\n动作\n旅行' } }); f.nodes().find(n => n.props.children === '保存旅行').props.onClick();
  await new Promise(r => setTimeout(r, 0)); assert.equal(f.stats().submitted.fields.biaoqian.join(','), '旅行,动作'); assert.equal(f.stats().submitted.fields.kaishiriqi, '2020-02-29'); assert.equal(f.stats().submitted.body, '<script>正文</script>'); assert.equal(f.stats().closed, 1);
});
