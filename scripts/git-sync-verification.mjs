import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { x, disk, services, record, layout, hash } from "./verification-runtime.mjs";
const run = promisify(execFile), evidence = JSON.parse(await readFile('tests/local-vault/DEV-031-restore-latest.json', 'utf8'));
const root = await mkdtemp(path.resolve('tests/local-vault/DEV-031-git-')), remote = path.join(root, 'remote.git'), a = path.join(root, 'desktop-a'), b = path.join(root, 'desktop-b');
const git = async (cwd, args) => (await run('git', ['-c', 'core.hooksPath=', ...args], { cwd, windowsHide: true })).stdout.trim();
await git(root, ['-c', 'init.templateDir=', 'init', '--bare', remote]); await git(root, ['clone', remote, a]);
const output = disk(a), rows = JSON.parse(await readFile(path.join(evidence.backup, 'snapshot-manifest.json'), 'utf8'));
for (const row of rows) { const data = await readFile(path.join(evidence.backup, row.path)); assert.equal(hash(data), row.sha256); await output.binary.create(row.path, data); }
for (const cwd of [a]) { await git(cwd, ['config', 'user.name', 'LifeOS Synthetic Test']); await git(cwd, ['config', 'user.email', 'lifeos-test@example.invalid']); await git(cwd, ['config', 'core.autocrlf', 'false']); }
await git(a, ['add', 'LifeOS']); await git(a, ['commit', '-m', 'Synthetic restore baseline']); await git(a, ['push', 'origin', 'HEAD']); await git(root, ['clone', remote, b]);
await git(b, ['config', 'user.name', 'LifeOS Synthetic Test']); await git(b, ['config', 'user.email', 'lifeos-test@example.invalid']); await git(b, ['config', 'core.autocrlf', 'false']);
const ledgerIds = [randomUUID(), randomUUID()], json = new x.JsonCodec();
for (const [index, cwd] of [a,b].entries()) { const target = layout.ledgerPath(ledgerIds[index]); await disk(cwd).fs.create(target, json.create(record('jizhang', ledgerIds[index]), '')); await git(cwd, ['add', 'LifeOS']); await git(cwd, ['commit', '-m', `Offline synthetic ledger ${index}`]); }
await git(a, ['push']); await git(b, ['pull', '--no-rebase', '--no-edit']); await git(b, ['push']); await git(a, ['pull', '--no-rebase', '--no-edit']);
for (const cwd of [a,b]) { const s = services(disk(cwd).fs); await s.index.rebuild(); assert.equal(s.index.issues().length, 0); assert.equal(s.index.all().length, 12); assert.equal(s.summary.read().expense, 3750); for (const row of rows.filter(r => r.path.includes('/90_附件/'))) assert.equal(hash(await readFile(path.join(cwd, row.path))), row.sha256); }
const conflict = `${layout.module('zhishi')}/合成zhishi.md`;
await appendFile(path.join(a, conflict), '\n桌面A离线修改\n'); await appendFile(path.join(b, conflict), '\n桌面B离线修改\n');
for (const cwd of [a,b]) { await git(cwd, ['add', conflict]); await git(cwd, ['commit', '-m', 'Independent synthetic knowledge edit']); }
await git(a, ['push']); let conflicted = false;
try { await git(b, ['pull', '--no-rebase', '--no-edit']); } catch (error) { assert.ok(String(error.stdout).includes('CONFLICT')); conflicted = true; }
assert.ok(conflicted); const ours = await git(b, ['show', `HEAD:${conflict}`]), theirs = await git(b, ['show', `MERGE_HEAD:${conflict}`]); assert.ok(ours.includes('桌面B离线修改')); assert.ok(theirs.includes('桌面A离线修改')); assert.ok((await readFile(path.join(b, conflict),'utf8')).includes('<<<<<<<'));
const s = services(disk(b).fs); await s.index.rebuild(); assert.ok(s.index.issues().some(issue => issue.path === conflict)); assert.equal(s.index.all().length, 11); assert.equal(s.summary.read().expense, 3750);
const report = { date: new Date().toISOString(), root, gitVersion: await git(root, ['--version']), remote: 'local synthetic bare repository only', offlineLedgerAdded: 2, mergedValidRecords: 12, expenseCents: 3750, attachmentHashesMatched: true, sameFileConflict: true, bothCommittedVersionsPreserved: true, conflictedRecordExcluded: true, manualResolutionPending: true, giteeTested: false, mobileTested: false };
await writeFile(path.join(root, 'report.json'), JSON.stringify(report,null,2)); console.log(JSON.stringify(report));
