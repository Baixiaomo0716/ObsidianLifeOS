import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as esbuild from 'esbuild';
const built = await esbuild.build({ stdin: { contents: 'export * from "./src/storage/paths"; export * from "./src/services/readable-note-name";', resolveDir: process.cwd(), loader:'ts' }, bundle:true, platform:'browser', format:'esm', write:false });
const x = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const root = path.resolve('dev-vault'), layout = new x.StorageLayout();
async function list(folder) {
 const result = []; for (const entry of await fs.readdir(folder,{withFileTypes:true})) {
  if (entry.isSymbolicLink()) throw new Error('Symbolic links prevent migration');
  const file = path.join(folder,entry.name); if (entry.isDirectory()) result.push(...await list(file)); else if (entry.isFile()) result.push(file);
 } return result;
}
const files = await list(root), occupied = new Set(files.map((file) => path.relative(root,file).split(path.sep).join('/').toLowerCase()));
const changes = [];
for (const file of files) {
 const relative = path.relative(root,file).split(path.sep).join('/');
 if (!relative.endsWith('.md') || !layout.isManaged(relative)) continue;
 const target = x.readableNoteName(relative,occupied); if (target === relative) continue;
 occupied.add(target.toLowerCase());
 changes.push({from:relative,to:target,original:await fs.readFile(file,'utf8')});
}
// Existing links should be renamed by Obsidian's FileManager command, which updates links.
// This external tool only operates when no Markdown references need rewriting.
for (const file of files.filter((file) => file.endsWith('.md'))) {
 const raw = await fs.readFile(file,'utf8');
 for (const change of changes) {
  const stem = path.posix.basename(change.from,'.md');
  if (raw.includes(stem) || raw.includes(encodeURIComponent(stem))) throw new Error('Use the in-app tidy command to preserve links: ' + change.from);
 }
}
const backup = path.resolve('tests/local-backups/readable-names-' + Date.now());
await fs.mkdir(backup,{recursive:true});
for (const change of changes) {
 const file = path.join(backup,change.from); await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,change.original,{flag:'wx'});
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
await fs.writeFile(path.join(backup,'manifest.json'),JSON.stringify(changes.map(({from,to,original}) => ({from,to,sha256:hash(original)})),null,2));
for (const change of changes) {
 const source = path.resolve(root,change.from), target = path.resolve(root,change.to);
 for (const file of [source,target]) if (!file.startsWith(root + path.sep)) throw new Error('Path escaped test Vault');
 if (await fs.readFile(source,'utf8') !== change.original) throw new Error('Source changed; original backups retained');
 await fs.link(source,target); // Exclusive creation; never overwrite an existing note.
 if (await fs.readFile(source,'utf8') !== change.original || await fs.readFile(target,'utf8') !== change.original) throw new Error('Concurrent update; both paths retained');
 await fs.unlink(source);
}
console.log(JSON.stringify({renamed:changes.map(({from,to})=>({from,to})),backup:path.relative(process.cwd(),backup)}));
