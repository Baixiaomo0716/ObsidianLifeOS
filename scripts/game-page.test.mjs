import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ['src/ui/GamePage.tsx'], bundle: true, format: 'cjs', platform: 'browser', external: ['react', 'react/jsx-runtime'], write: false });
function fixture(editor = false) {
  const states = []; let cursor = 0, created = 0, opened, query, submitted, closed = 0;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = typeof initial === 'function' ? initial() : initial; return [states[n], v => { states[n] = typeof v === 'function' ? v(states[n]) : v; }]; }, useRef: v => ({ current: v }), useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: n => n === 'react' ? fake : require(n) });
  const source = { path: '游戏/测试游戏.md', version: { original: 'raw' }, body: '<script>正文</script>', attributes: { biaoshi: 'game', jindu: 'weikaishi', biaoqian: ['游戏'], leixing: '角色扮演', faxingshijian: '2020-02-29' } };
  const service = { subscribe: () => () => {}, list: (...q) => { query = q; return { ready: true, total: 1, issues: 0, page: 1, pages: 1, items: [source] }; }, prepare: async (s, e) => { submitted = e; return {}; }, execute: async () => {} };
  const port = { service, create: () => created++, open: id => { opened = id; } };
  const render = () => { cursor = 0; return editor ? module.exports.GameEditor({ source, service, close: () => closed++ }) : module.exports.GamePage({ port }); };
  const walk = n => !n || typeof n !== 'object' ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  return { nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ created, opened, query, submitted, closed }) };
}
test('game page uses template creation, native opening and type/progress filters', () => {
  const f = fixture(); assert.match(f.html(), /游戏工作台/);
  f.nodes().find(n => n.props.children === '新建游戏笔记').props.onClick(); f.nodes().find(n => n.props.children === '打开原笔记').props.onClick();
  f.nodes().filter(n => n.type === 'input')[1].props.onChange({ target: { value: '角色扮演' } }); f.nodes().find(n => n.type === 'select').props.onChange({ target: { value: 'jinxingzhong' } }); f.nodes();
  assert.equal(f.stats().created, 1); assert.equal(f.stats().opened, 'game'); assert.equal(f.stats().query[1], 'jinxingzhong'); assert.equal(f.stats().query[4], '角色扮演');
});
test('game editor preserves date-only release, deduplicates tags and saves literal body', async () => {
  const f = fixture(true), html = f.html(); assert.match(html, /type="date"/); assert.doesNotMatch(html, /datetime-local|时长|次数|评分/); assert.match(html, /&lt;script&gt;/);
  f.nodes().filter(n => n.type === 'textarea')[2].props.onChange({ target: { value: '游戏\n动作\n游戏' } }); f.nodes().find(n => n.props.children === '保存游戏').props.onClick();
  await new Promise(r => setTimeout(r, 0)); assert.equal(f.stats().submitted.fields.biaoqian.join(','), '游戏,动作'); assert.equal(f.stats().submitted.fields.faxingshijian, '2020-02-29'); assert.equal(f.stats().submitted.body, '<script>正文</script>'); assert.equal(f.stats().closed, 1);
});
