import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ['src/ui/KnowledgePage.tsx'], bundle: true, format: 'cjs', platform: 'browser', external: ['react', 'react/jsx-runtime'], write: false });
function fixture(editor = false) {
  const states = []; let cursor = 0, created = 0, opened, query, submitted, closed = 0;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = typeof initial === 'function' ? initial() : initial; return [states[n], v => { states[n] = typeof v === 'function' ? v(states[n]) : v; }]; }, useRef: v => ({ current: v }), useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: n => n === 'react' ? fake : require(n) });
  const source = { path: '知识/测试知识.md', version: { original: 'raw' }, body: '[[笔记|别名]]\n<script>正文</script>', attributes: { biaoshi: 'knowledge', jindu: 'weikaishi', biaoqian: ['学习'], neirong: '内容' } };
  const service = { subscribe: () => () => {}, list: (...q) => { query = q; return { ready: true, total: 1, issues: 0, page: 1, pages: 1, items: [source] }; }, get: () => source, incoming: () => [{ path: '日记.md', attributes: { biaoshi: 'diary' } }], prepare: async (s, e) => { submitted = e; return {}; }, execute: async () => {} };
  const port = { service, create: () => created++, open: id => { opened = id; } };
  const render = () => { cursor = 0; return editor ? module.exports.KnowledgeEditor({ source, service, close: () => closed++ }) : module.exports.KnowledgePage({ port }); };
  const walk = n => !n || typeof n !== 'object' ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  return { nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ created, opened, query, submitted, closed }) };
}
test('knowledge page creates native notes, filters and opens valid incoming diary relation', () => {
  const f = fixture(); f.nodes().find(n => n.props.children === '新建知识笔记').props.onClick(); f.nodes().find(n => n.props.children === '测试知识').props.onClick(); assert.match(f.html(), /&lt;script&gt;/); assert.match(f.html(), /\[\[笔记\|别名\]\]/);
  f.nodes().find(n => n.props.children === '日记').props.onClick(); assert.equal(f.stats().opened, 'diary'); assert.equal(f.stats().created, 1);
  f.nodes().find(n => n.type === 'input').props.onChange({ target: { value: '内容' } }); f.nodes(); assert.equal(f.stats().query[0], '内容');
});
test('knowledge editor saves tags/content and literal wiki body with no forced source/type', async () => {
  const f = fixture(true), html = f.html(); assert.doesNotMatch(html, /来源|类型/); assert.match(html, /&lt;script&gt;/);
  f.nodes().filter(n => n.type === 'textarea')[0].props.onChange({ target: { value: '学习\n知识\n学习' } }); f.nodes().find(n => n.props.children === '保存知识').props.onClick();
  await new Promise(r => setTimeout(r, 0)); assert.equal(f.stats().submitted.fields.biaoqian.join(','), '学习,知识'); assert.equal(f.stats().submitted.fields.neirong, '内容'); assert.equal(f.stats().submitted.body, '[[笔记|别名]]\n<script>正文</script>'); assert.equal(f.stats().closed, 1);
});
