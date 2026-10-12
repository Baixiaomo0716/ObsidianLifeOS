import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { x, disk, manifest, services, record, layout, clock, ids, hash } from "./verification-runtime.mjs";
test("independent disk snapshot restores all entity files, binary attachments, relations, totals and completed operation receipts", async () => {
  await mkdir('tests/local-vault', { recursive: true }); await mkdir('tests/local-backups', { recursive: true });
  const source = await mkdtemp(path.resolve('tests/local-vault/DEV-031-source-')), backup = await mkdtemp(path.resolve('tests/local-backups/DEV-031-')), restored = await mkdtemp(path.resolve('tests/local-vault/DEV-031-restored-'));
  const adapter = disk(source), original = services(adapter.fs), records = new Map();
  for (const type of x.shiti.filter(t => t !== 'jizhang')) { const data = record(type, randomUUID(), { extra: { preserve: '未知属性😀' } }), file = `${layout.module(type)}/合成${type}.md`; await original.notes.create(file, data, '# 原生正文😀\n- [ ] 不能丢失\n'); records.set(type, file); }
  const project = await original.notes.read(records.get('xiangmu')), projectId = project.attributes.biaoshi;
  const task = await original.notes.read(records.get('daiban')); await original.notes.update(task.version, { set: { guanlian: [projectId], jindu: 'jinxingzhong' } });
  const ledgerId = randomUUID(), request = { caozuobiaoshi: randomUUID(), buzhou: [{ caozuoleixing: 'chuangjian', lujing: layout.ledgerPath(ledgerId), jilu: record('jizhang', ledgerId) }] }; await original.operations.run(request);
  const journal = await original.notes.read(records.get('riji')); await original.notes.update(journal.version, { set: { guanlian: [projectId, task.attributes.biaoshi, ledgerId] } });
  const attachment = new x.AttachmentStore(adapter.fs, adapter.binary, layout, clock, ids, { of: async bytes => hash(Buffer.from(bytes)) }, 100, () => true), refs = new x.AttachmentReferenceService(original.index, attachment, original.operations, ids, () => true);
  const info = await attachment.execute(await attachment.prepare({ name: '备份资料.pdf', type: 'application/pdf', size: 4, arrayBuffer: async () => Uint8Array.from([1,2,3,4]).buffer }, projectId)); await refs.execute(await refs.prepare(project, [info.路径])); await original.index.rebuild();
  const before = await manifest(source); assert.equal(original.index.all().length, 10); assert.equal(original.index.issues().length, 0);
  async function copy(from, to) { const output = disk(to); for (const row of before) await output.binary.create(row.path, await readFile(path.join(from, row.path))); assert.deepEqual(await manifest(to), before); }
  await copy(source, backup); await writeFile(path.join(backup, 'snapshot-manifest.json'), JSON.stringify(before, null, 2), { flag: 'wx' }); await copy(backup, restored);
  const restoredAdapter = disk(restored), result = services(restoredAdapter.fs); await result.index.rebuild();
  assert.equal(result.index.issues().length, 0); assert.equal(result.index.all().length, 10); assert.deepEqual(result.summary.read(), original.summary.read()); assert.deepEqual(result.search.relations(projectId), original.search.relations(projectId)); assert.equal(result.projects.detail(projectId).ratio, 0);
  const freshAttachments = new x.AttachmentStore(restoredAdapter.fs, restoredAdapter.binary, layout, clock, ids, { of: async bytes => hash(Buffer.from(bytes)) }, 100, () => true); assert.deepEqual(await freshAttachments.verifyPath(info.路径), info);
  assert.equal((await result.notes.read(records.get('riji'))).body, (await original.notes.read(records.get('riji'))).body); await result.operations.run(request); assert.deepEqual(await manifest(restored), before); assert.deepEqual(await manifest(source), before);
  const evidence = { date: new Date().toISOString(), source, backup, restored, businessRecords: 10, files: before.length, issues: 0, expense: result.summary.read().expense, verified: ['sha256', 'binary', 'relations', 'projectRatio', 'summary', 'nativeBody', 'completedReceiptNoReplay'], originalUnchanged: true, hostRestartTested: false, remoteSyncTested: false, separatePhysicalDisk: false };
  await writeFile('tests/local-vault/DEV-031-restore-latest.json', JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
});
