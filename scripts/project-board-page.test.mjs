import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ['src/ui/ProjectBoard.tsx'], bundle: true, format: 'cjs', platform: 'browser', external: ['react', 'react/jsx-runtime'], write: false });
function fixture() {
  const states = []; let cursor = 0, selected, query;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = initial; return [states[n], value => { states[n] = typeof value === 'function' ? value(states[n]) : value; }]; } };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: n => n === 'react' ? fake : require(n) });
  const port = { service: { board: (...q) => { query = q; return { ready: true, total: 51, issues: 0, columns: ['weikaishi', 'jinxingzhong', 'yiwancheng'].map(progress => ({ progress, total: progress === 'jinxingzhong' ? 51 : 0, page: 1, pages: progress === 'jinxingzhong' ? 2 : 1, items: progress === 'jinxingzhong' ? [{ path: '<script>项目.md', attributes: { biaoshi: 'p', yiquxiao: true } }] : [] })) }; } } };
  const render = () => { cursor = 0; return module.exports.ProjectBoard({ port, text: '项目', select: id => { selected = id; } }); };
  const walk = n => !n || typeof n !== 'object' ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  return { nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ selected, query }) };
}
test('board cards select existing detail and render three scroll regions with escaped names', () => {
  const f = fixture(), html = f.html(); assert.match(html, /&lt;script&gt;项目/); assert.equal((html.match(/role="region"/g) ?? []).length, 3); assert.match(html, /已取消/);
  f.nodes().find(n => n.props.children === '<script>项目').props.onClick(); assert.equal(f.stats().selected, 'p');
});
test('board column paging and inactive toggle feed shared query without changing progress', () => {
  const f = fixture(); f.nodes().filter(n => n.props.children === '下一页')[1].props.onClick(); f.nodes(); assert.equal(f.stats().query[1].jinxingzhong, 2);
  f.nodes().find(n => n.type === 'input').props.onChange({ target: { checked: true } }); f.nodes(); assert.equal(f.stats().query[2], true); assert.equal(Object.keys(f.stats().query[1]).length, 0);
});
