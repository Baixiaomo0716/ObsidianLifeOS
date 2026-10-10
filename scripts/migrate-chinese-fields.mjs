import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
const build = await esbuild.build({ stdin: { contents: 'export * from "./src/services/field-migration"; export * from "./src/services/note-properties"; export * from "./src/storage/index"; export { validateSettings, defaultSettings } from "./src/settings/settings-store";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "browser", format: "esm", write: false });
const x = await import("data:text/javascript;base64," + Buffer.from(build.outputFiles[0].text).toString("base64"));
const mode = process.argv[2];
if (!["--templates", "--vault"].includes(mode)) throw new Error("Specify --templates or --vault");
const vault = path.resolve("dev-vault"), templates = path.resolve("templates");
const backup = path.resolve("tests/local-backups/chinese-fields-" + Date.now());
const fingerprint = (text) => createHash("sha256").update(text).digest("hex");
async function list(folder) {
  const files = []; for (const item of await fs.readdir(folder, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error("Migration refuses symbolic links");
    const full = path.join(folder, item.name);
    if (item.isDirectory()) files.push(...await list(full)); else if (item.isFile()) files.push(full);
  } return files;
}
const changes = [];
if (mode === "--templates") {
  for (const name of ["日记", "阅读", "影视", "游戏", "演出", "旅行", "知识", "待办", "项目"]) {
    const file = path.join(templates, name + ".md"), before = await fs.readFile(file, "utf8");
    changes.push({ file, before, after: x.migrateEntityFields(before, "note", "Asia/Shanghai") });
  }
} else {
  let settings = x.defaultSettings();
  try { settings = x.validateSettings(new x.JsonCodec().decode(await fs.readFile(path.join(vault, "LifeOS配置/shezhi.json"), "utf8")).attributes); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const layout = new x.StorageLayout(settings.genmulu, settings.mulu);
  const files = await list(vault);
  for (const file of files) {
    const relative = path.relative(vault, file).split(path.sep).join("/");
    if (relative.startsWith(layout.root + "/00_系统/operations/") && relative.endsWith(".json")) {
      const log = new x.JsonCodec().decode(await fs.readFile(file, "utf8")).attributes;
      if (!Array.isArray(log.buzhou) || log.buzhou.some((step) => step.jieguo !== "yiwancheng")) throw new Error("Unfinished operation prevents migration: " + relative);
    }
    if (relative.startsWith(layout.root + "/00_系统/chushihua/") && relative.endsWith(".json")) {
      const log = new x.JsonCodec().decode(await fs.readFile(file, "utf8")).attributes;
      if (log.jieguo !== "yiwancheng") throw new Error("Unfinished initialization prevents migration: " + relative);
    }
    const customTemplate = relative.startsWith(layout.root + "/00_系统/模板/") && relative.endsWith(".md");
    if (!layout.isManaged(relative) && !customTemplate) continue;
    const before = await fs.readFile(file, "utf8"), kind = !customTemplate && layout.typeFor(relative) === "jizhang" ? "ledger" : "note";
    const after = x.migrateEntityFields(before, kind, settings.shiqu);
    changes.push({ file, before, after });
  }
  const file = path.join(vault, ".obsidian/types.json");
  let before = null; try { before = await fs.readFile(file, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  changes.push({ file, before, after: x.propertyTypes(before ?? "{}") });
}
// Preflight the whole set, then back up exact original bytes before the first write.
for (const change of changes) {
  const allowed = mode === "--templates" ? templates : vault;
  if (!change.file.startsWith(allowed + path.sep)) throw new Error("Path escaped intended directory");
  const original = change.before;
  if (original !== null) {
    const saved = path.join(backup, path.relative(process.cwd(), change.file));
    await fs.mkdir(path.dirname(saved), { recursive: true }); await fs.writeFile(saved, original, { flag: "wx" });
    if (fingerprint(await fs.readFile(saved, "utf8")) !== fingerprint(original)) throw new Error("Backup mismatch");
  }
}
for (const change of changes) {
  let current = null; try { current = await fs.readFile(change.file, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (current !== change.before) throw new Error("Source changed; earlier files may be migrated. Original backups retained: " + change.file);
  if (current === change.after) continue;
  const temporary = change.file + ".lifeos-migration-" + Date.now();
  await fs.writeFile(temporary, change.after, { flag: "wx" });
  if (change.before === null) { await fs.link(temporary, change.file); await fs.unlink(temporary); }
  else { if (await fs.readFile(change.file, "utf8") !== change.before) throw new Error("Concurrent change; temporary file retained"); await fs.rename(temporary, change.file); }
  if (await fs.readFile(change.file, "utf8") !== change.after) throw new Error("Migration verification failed");
}
await fs.mkdir(backup, { recursive: true });
await fs.writeFile(path.join(backup, "manifest.json"), JSON.stringify(changes.map(({ file, before, after }) => ({ file: path.relative(process.cwd(), file), before: before === null ? null : fingerprint(before), after: fingerprint(after) })), null, 2));
console.log(JSON.stringify({ mode, checked: changes.length, changed: changes.filter((item) => item.before !== item.after).length, backup: path.relative(process.cwd(), backup) }));
