import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { x, record, layout, services, disk } from "./verification-runtime.mjs";
const files = new Map(), md = new x.MarkdownCodec(), json = new x.JsonCodec(), types = x.shiti.filter(t => t !== 'riji');
files.set(`${layout.module('riji')}/2026-10-12.md`, md.create(record('riji'), '# 合成日记\n'));
for (let n = 1; n < 10000; n++) { const type = types[(n - 1) % types.length], id = randomUUID(), a = record(type, id, type === 'jizhang' ? {} : { [type === 'yuedu' ? 'zhuangtai' : 'jindu']: 'jinxingzhong' }); files.set(type === 'jizhang' ? layout.ledgerPath(id) : `${layout.module(type)}/合成${n}.md`, (type === 'jizhang' ? json : md).create(a, type === 'jizhang' ? '' : '# 10000条性能测试\n' + '中文正文与长标题样本。'.repeat(40))); }
let reads = 0; let fs = { list: async () => [...files.keys()], read: async p => { reads++; if (!files.has(p)) throw new x.StoreError('not_found', 'missing'); return files.get(p); }, create: async () => { throw Error('benchmark read only'); }, process: async () => { throw Error('benchmark read only'); } };
let diskSource;
if (process.argv.includes('--disk')) {
  await mkdir('tests/local-vault', { recursive: true }); diskSource = await mkdtemp(path.resolve('tests/local-vault/DEV-031-benchmark-data-')); const adapter = disk(diskSource), entries = [...files];
  for (let n = 0; n < entries.length; n += 50) await Promise.all(entries.slice(n,n+50).map(([p,raw]) => adapter.fs.create(p,raw)));
  const actualRead = adapter.fs.read; adapter.fs.read = async p => { reads++; return actualRead(p); }; fs = adapter.fs;
}
const s = services(fs), timings = {};
async function measure(name, action) { const start = performance.now(), result = await action(); timings[name] = Math.round((performance.now() - start) * 100) / 100; return result; }
let ticks = 0, maxGapMs = 0, lastTick = performance.now(); const heartbeat = setInterval(() => { const now = performance.now(); maxGapMs = Math.max(maxGapMs, now-lastTick); lastTick = now; ticks++; }, 10);
try { await measure('indexRebuildMs', () => s.index.rebuild()); } finally { clearInterval(heartbeat); } assert.equal(s.index.all().length, 10000); assert.equal(s.index.issues().length, 0);
const query = await measure('searchPageMs', () => s.search.query({ type: 'all', text: '性能测试' })); assert.equal(query.total, 8888); assert.equal(query.items.length, 50);
const summary = await measure('summaryMs', () => s.summary.read()); assert.equal(summary.ongoing.length, 8888);
const file = [...files.keys()].find(p => p.endsWith('.md') && !p.includes('10_日记')); if (diskSource) { const current = await s.notes.read(file); await measure('singleFileSaveMs', () => s.notes.update(current.version, { body: current.body + '\n手工更新' })); } else files.set(file, files.get(file) + '\n手工更新'); const beforeReads = reads; await measure('singleFileReindexMs', () => s.index.changed(file)); assert.equal(reads - beforeReads, 1);
const report = { date: new Date().toISOString(), node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryGiB: +(os.totalmem()/2**30).toFixed(1), records: 10000, bytes: [...files.values()].reduce((n,s) => n+Buffer.byteLength(s),0), adapter: diskSource ? 'real disk UTF-8 files, real codecs/services; excludes Obsidian rendering and sync' : 'in-memory UTF-8 files, real codecs/services; excludes disk and Obsidian rendering', diskSource, heartbeat: { ticks, maxGapMs: Math.round(maxGapMs) }, timings, searchTotal: query.total, ongoing: summary.ongoing.length, rssMiB: +(process.memoryUsage().rss/2**20).toFixed(1) };
await mkdir('tests/local-vault', { recursive: true }); const output = await mkdtemp(path.resolve('tests/local-vault/DEV-031-performance-')); await writeFile(path.join(output, 'report.json'), JSON.stringify(report,null,2)); console.log(JSON.stringify({ ...report, output }));
