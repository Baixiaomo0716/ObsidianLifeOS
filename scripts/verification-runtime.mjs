import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";
const bundle = await esbuild.build({ stdin: { contents: ['storage/index', 'domain/index', 'services/index', 'services/search-service', 'services/summary-service', 'services/project-service', 'services/reading-service', 'services/film-service', 'services/game-service', 'services/performance-service', 'services/travel-service', 'services/knowledge-service', 'services/period-review-service', 'services/attachment-reference-service', 'storage/attachment-store', 'settings/settings-store'].map(p => `export * from "./src/${p}";`).join('\n'), resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "browser", write: false, plugins: [mobileDependencyGuard()] });
export const x = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
export const now = "2026-10-12T00:00:00Z", layout = new x.StorageLayout(), clock = { now: () => now }, ids = { next: randomUUID };
export const hash = data => createHash("sha256").update(data).digest("hex"), fingerprint = { of: async raw => hash(raw) };
export function record(type, id = randomUUID(), extra = {}) {
  return x.deriveDateFields(x.normalizeInput({ shiti: type, biaoshi: id, jiegoubanben: 2, shuxingmoshi: "tongyi", bijishiqu: "Asia/Shanghai", chuangjianshijian: now, gengxinshijian: now, mingcheng: "合成记录", biaoqian: ["合成测试"], ...(type === "riji" ? { riqi: "2026-10-12", guanlian: [] } : type === "daiban" ? { guanlian: [] } : type === "xiangmu" ? { daiban: [], shangchuanwenjian: [] } : type === "jizhang" ? { riqi: "2026-10-12", shouzhi: "zhichu", fenlei: "餐饮", jine: 1250 } : {}), ...extra }));
}
export function disk(root) {
  const target = relative => { x.safePath(relative); const absolute = path.resolve(root, relative), diff = path.relative(root, absolute); if (diff.startsWith('..') || path.isAbsolute(diff)) throw Error("outside test root"); return absolute; };
  const read = async relative => { try { return await readFile(target(relative)); } catch (e) { if (e.code === 'ENOENT') throw new x.StoreError('not_found', 'missing', relative); throw e; } };
  const create = async (relative, data) => { const absolute = target(relative); await mkdir(path.dirname(absolute), { recursive: true }); await writeFile(absolute, data, { flag: 'wx' }); };
  const list = async () => {
    const paths = [];
    async function walk(dir, prefix = '') { for (const entry of await readdir(dir, { withFileTypes: true })) { if (entry.isSymbolicLink()) throw Error('test adapter refuses symlinks'); const relative = prefix + entry.name; if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative + '/'); else paths.push(relative); } }
    await walk(root); return paths;
  };
  const fs = { list, read: async relative => (await read(relative)).toString('utf8'), create, process: async (relative, fn) => { const result = fn(await fs.read(relative)); await writeFile(target(relative), result, 'utf8'); return result; } };
  const binary = { read: async relative => { const data = await read(relative); return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); }, create: (relative, data) => create(relative, Buffer.from(data)) };
  return { fs, binary };
}
export async function manifest(root) {
  const rows = [];
  async function walk(dir, prefix = '') { for (const entry of await readdir(dir, { withFileTypes: true })) { const relative = prefix + entry.name; if (entry.isSymbolicLink()) throw Error("test snapshot refuses symlinks"); if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative + '/'); else { const data = await readFile(path.join(dir, entry.name)); rows.push({ path: relative, bytes: data.length, sha256: hash(data) }); } } }
  await walk(root); return rows.sort((a,b) => a.path.localeCompare(b.path));
}
export function services(fs) {
  const notes = new x.NoteStore(fs, layout, clock), ledger = new x.LedgerStore(fs, layout, clock), index = new x.EntityIndex(fs, layout), operations = new x.OperationService(fs, layout, notes, ledger, clock, ids, { get: async () => "11111111-abcd-4abc-8abc-123456789abc" }, fingerprint);
  return { notes, ledger, index, operations, search: new x.SearchService(index, 'Asia/Shanghai'), summary: new x.SummaryService(index, clock, 'Asia/Shanghai', x.shiti), projects: new x.ProjectService(index, operations, clock, ids, () => true) };
}
