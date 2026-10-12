import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ['src/ui/TagPage.tsx'], bundle: true, format: 'cjs', platform: 'browser', external: ['react', 'react/jsx-runtime'], write: false });
function fixture() {
  const states = []; let cursor = 0, query, tagQuery, opened;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = initial; return [states[n], v => { states[n] = typeof v === 'function' ? v(states[n]) : v; }]; }, useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: n => n === 'react' ? fake : require(n) });
  const service = { subscribe: () => () => {}, tags: (...q) => { tagQuery = q; return { ready: true, issues: 0, total: 51, page: q[3], pages: 2, items: [{ label: '<学习>', count: 55 }] }; }, query: q => { query = q; return { ready: true, total: 55, page: q.page, pages: 2, items: [{ id: 'k', type: 'zhishi', title: '<知识>', tags: ['<学习>'] }] }; } };
  const render = () => { cursor = 0; return module.exports.TagPage({ port: { service, open: id => { opened = id; } }, type: 'all', allowed: ['zhishi', 'yuedu'] }); };
  const walk = n => !n || typeof n !== 'object' ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  return { nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ query, tagQuery, opened }) };
}
test('tag selection passes exact scope and opens original record, labels render safely', () => {
  const f = fixture(); f.nodes().find(n => n.props.className === 'lifeos-tag-button').props.onClick(); const html = f.html(); assert.match(html, /&lt;学习&gt;/); assert.match(html, /&lt;知识&gt;/); assert.equal(f.stats().query.tag, '<学习>'); assert.equal(f.stats().query.allowed.join(','), 'zhishi,yuedu');
  f.nodes().find(n => n.type === 'button' && React.Children.toArray(n.props.children).join('') === '知识 · <知识>').props.onClick(); assert.equal(f.stats().opened, 'k');
});
test('tag and record pagination independent, tag selection clears content search', () => {
  const f = fixture(); f.nodes().find(n => n.props.className === 'lifeos-tag-button').props.onClick(); f.nodes().find(n => n.props.children === '下一页记录').props.onClick(); f.nodes(); assert.equal(f.stats().query.page, 2);
  f.nodes().find(n => n.props.children === '下一页标签').props.onClick(); f.nodes(); assert.equal(f.stats().tagQuery[3], 2); assert.equal(f.stats().query.page, 2);
  f.nodes().filter(n => n.type === 'input')[1].props.onChange({ target: { value: '正文' } }); f.nodes(); assert.equal(f.stats().query.text, '正文'); f.nodes().find(n => n.props.className === 'lifeos-tag-button').props.onClick(); f.nodes(); assert.equal(f.stats().query.text, ''); assert.equal(f.stats().query.page, 1);
});
