import assert from 'node:assert/strict';
import { test } from 'node:test';
import { x, record, layout, services, clock } from './verification-runtime.mjs';
async function fixture() {
  const files = new Map(), codec = new x.MarkdownCodec();
  const fs = { list: async () => [...files.keys()], read: async p => files.get(p), create: async () => { throw Error('read only'); }, process: async () => { throw Error('read only'); } };
  const s = services(fs);
  const add = (name, extra) => { const path = `${layout.module('xiangmu')}/${name}.md`; files.set(path, codec.create(record('xiangmu', undefined, extra), '项目正文')); return path; };
  add('未开始', { jindu: 'weikaishi' }); add('进行中', { jindu: 'jinxingzhong', jiezhiriqi: '2026-10-20' }); add('完成', { jindu: 'yiwancheng', wanchengshijian: clock.now() });
  add('取消', { yiquxiao: true, quxiaoshijian: clock.now() }); add('归档', { yiguidang: true }); add('回收', { yihuishou: true, huishoushijian: clock.now() });
  await s.index.rebuild(); return { ...s, files, add };
}
test('board totals and columns share scope, inactive opt-in never includes recycled projects', async () => {
  const f = await fixture(), board = f.projects.board(); assert.equal(board.total, 3); assert.deepEqual(board.columns.map(c => c.total), [1, 1, 1]);
  assert.equal(f.projects.board('', {}, true).total, 5); assert.equal(f.projects.board('归档').total, 0); assert.equal(f.projects.board('归档', {}, true).total, 1);
});
test('board paginates each full column independently and clamps after deletion', async () => {
  const f = await fixture(); for (let n = 0; n < 55; n++) f.add(`分页${n}`, { jindu: 'jinxingzhong' }); await f.index.rebuild();
  const board = f.projects.board('', { jinxingzhong: 2 }); assert.equal(board.total, 58); assert.equal(board.columns[1].total, 56); assert.equal(board.columns[1].items.length, 6); assert.equal(board.columns[0].page, 1);
  const filtered = f.projects.board('完成', { yiwancheng: 999 }); assert.equal(filtered.columns[2].page, 1); assert.equal(filtered.total, 1);
});
test('board search and deadline order use all matching records and never mutate disk', async () => {
  const f = await fixture(); f.add('早截止', { jindu: 'jinxingzhong', jiezhiriqi: '2026-10-15', biaoqian: ['目标'] }); await f.index.rebuild();
  const before = [...f.files]; assert.match(f.projects.board().columns[1].items[0].path, /早截止/); assert.equal(f.projects.board('目标 正文').total, 1); assert.deepEqual([...f.files], before);
});
test('duplicate identity excluded from board and detail, source files remain untouched', async () => {
  const f = await fixture(), path = [...f.files.keys()][0], raw = f.files.get(path); f.files.set(`${layout.module('xiangmu')}/副本.md`, raw); await f.index.rebuild();
  assert.equal(f.projects.board().total, 2); assert.equal(f.projects.board().issues, 2); assert.equal(f.projects.detail(new x.MarkdownCodec().decode(raw).attributes.biaoshi), undefined); assert.equal(f.files.get(path), raw);
});
