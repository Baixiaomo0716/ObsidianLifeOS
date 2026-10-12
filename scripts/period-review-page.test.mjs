import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as esbuild from 'esbuild';
const require = createRequire(import.meta.url), b = await esbuild.build({ entryPoints: ['src/ui/PeriodReviewPage.tsx'], bundle: true, format: 'cjs', platform: 'browser', external: ['react', 'react/jsx-runtime'], write: false });
function fixture(overflow = false) {
  const states = []; let cursor = 0, query, opened;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = typeof initial === 'function' ? initial() : initial; return [states[n], v => { states[n] = typeof v === 'function' ? v(states[n]) : v; }]; }, useEffect() {} };
  const module = { exports: {} }; vm.runInNewContext(b.outputFiles[0].text, { module, exports: module.exports, require: n => n === 'react' ? fake : require(n) });
  const service = { subscribe: () => () => {}, currentPeriod: () => '2026-10', read: (...q) => { query = q; return { ready: true, issues: 0, from: '2026-10-01', to: '2026-10-31', total: 55, page: q[2], pages: 2, metrics: [{ key: 'zhishi:chuangjianshijian', label: '新增知识', total: 55 }], items: [{ id: 'k', type: 'zhishi', title: '<知识>', date: '2026-10-12', bases: ['创建时间'] }], ...(overflow ? { moneyError: '超出安全范围' } : { totals: { shouru: 123, zhichu: 124, jieyu: -1 } }) }; } };
  const render = () => { cursor = 0; return module.exports.PeriodReviewPage({ port: { service, open: id => { opened = id; } } }); };
  const walk = n => !n || typeof n !== 'object' ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  return { nodes: () => walk(render()), html: () => renderToStaticMarkup(render()), stats: () => ({ query, opened }) };
}
test('period UI opens originals safely and formats negative cents', () => {
  const f = fixture(); assert.match(f.html(), /&lt;知识&gt;/); assert.match(f.html(), /-0\.01/); f.nodes().find(n => n.type === 'button' && React.Children.toArray(n.props.children).join('') === '知识 · <知识>').props.onClick(); assert.equal(f.stats().opened, 'k');
});
test('year switch category and date edits reset pagination', () => {
  const f = fixture(); f.nodes().find(n => n.props.children === '下一页回顾').props.onClick(); f.nodes(); assert.equal(f.stats().query[2], 2);
  f.nodes().find(n => n.type === 'select' && n.props.value === 'month').props.onChange({ target: { value: 'year' } }); f.nodes(); assert.deepEqual(f.stats().query, ['2026', 'all', 1]);
  f.nodes().find(n => n.type === 'select' && n.props.value === 'all').props.onChange({ target: { value: 'zhishi:chuangjianshijian' } }); f.nodes(); assert.equal(f.stats().query[1], 'zhishi:chuangjianshijian');
  f.nodes().find(n => n.type === 'input').props.onChange({ target: { value: '2025' } }); f.nodes(); assert.equal(f.stats().query[0], '2025');
});
test('overflow message shown without fabricated totals', () => { const f = fixture(true); assert.match(f.html(), /超出安全范围/); assert.doesNotMatch(f.html(), /收入 ¥/); });
