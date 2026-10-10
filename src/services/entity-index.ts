import type { FileSystem } from "../ports/file-system";
import type { Snapshot } from "../ports/entity-store";
import { StorageLayout } from "../storage/paths";
import { MarkdownCodec, JsonCodec } from "../storage/codecs";
import { cloneData } from "../storage/data-values";
import { validateRecord, uuidV4 } from "../domain/validation";
import { StoreError } from "../domain/errors";

export interface IndexIssue { path: string; code: string; message: string }
export class EntityIndex {
  private entries = new Map<string, Snapshot>();
  private failures = new Map<string, IndexIssue>();
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private ready = false;
  private listeners = new Set<() => void>();
  subscribe(listener: () => void): () => void { this.active(); this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish(): void { for (const listener of this.listeners) { try { listener(); } catch { /* A view cannot prevent cache publication. */ } } }
  constructor(private readonly fs: FileSystem, private readonly layout: StorageLayout) {}
  private active(): void { if (this.stopped) throw new StoreError("inactive", "索引已停止"); }
  private serial(action: () => Promise<void>): Promise<void> {
    const result = this.queue.then(() => { this.active(); return action(); });
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async load(path: string, entries: Map<string, Snapshot>, failures: Map<string, IndexIssue>): Promise<void> {
    entries.delete(path); failures.delete(path);
    if (!this.layout.isManaged(path)) return;
    try {
      const raw = await this.fs.read(path);
      const decoded = (this.layout.typeFor(path) === "jizhang" ? new JsonCodec() : new MarkdownCodec()).decode(raw);
      this.layout.assertRecord(path, decoded.attributes);
      const validation = validateRecord(decoded.attributes);
      entries.set(path, { path, version: { path, original: raw }, ...decoded, validation });
    } catch (error) {
      if (error instanceof StoreError && error.code === "inactive") throw error;
      failures.set(path, { path, code: error instanceof StoreError ? error.code : "io", message: error instanceof Error ? error.message : "读取失败" });
    }
  }
  rebuild(): Promise<void> {
    return this.serial(async () => {
      const entries = new Map<string, Snapshot>(), failures = new Map<string, IndexIssue>();
      const paths = [...new Set(await this.fs.list())].filter((path) => this.layout.isManaged(path)).sort();
      for (let i = 0; i < paths.length; i++) {
        this.active(); await this.load(paths[i]!, entries, failures);
        // Yield between batches; browser-safe, without a desktop dependency.
        if ((i + 1) % 50 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      this.active(); this.entries = entries; this.failures = failures; this.ready = true; this.publish();
    });
  }
  changed(path: string, oldPath?: string): Promise<void> {
    return this.serial(async () => {
      if (!this.ready) return;
      const entries = new Map(this.entries), failures = new Map(this.failures);
      if (oldPath) { entries.delete(oldPath); failures.delete(oldPath); }
      await this.load(path, entries, failures);
      this.active(); this.entries = entries; this.failures = failures; this.publish();
    });
  }
  removed(path: string): Promise<void> {
    return this.serial(async () => {
      if (!this.ready) return;
      this.entries.delete(path); this.failures.delete(path); this.publish();
    });
  }
  private duplicates(): Set<string> {
    const groups = new Map<string, string[]>();
    for (const [path, snapshot] of this.entries) {
      const id = snapshot.attributes.biaoshi;
      if (typeof id !== "string" || !uuidV4.test(id)) continue;
      const key = id.toLowerCase();
      const paths = groups.get(key);
      if (paths) paths.push(path); else groups.set(key, [path]);
    }
    return new Set([...groups.values()].filter((paths) => paths.length > 1).flat());
  }
  all(): Snapshot[] {
    this.active(); const duplicates = this.duplicates(), diaries = this.duplicateDiaries();
    return [...this.entries.values()].filter((entry) => entry.validation.ok && !duplicates.has(entry.path)
      && entry.attributes.yihuishou !== true && !diaries.has(entry.path)).map((entry) => cloneData(entry));
  }
  snapshots(): Snapshot[] { this.active(); return [...this.entries.values()].map((entry) => cloneData(entry)); }
  private duplicateDiaries(): Set<string> {
    const dates = new Map<string, string[]>();
    for (const [path, entry] of this.entries) {
      if (entry.attributes.shiti !== "riji" || !entry.validation.ok || entry.attributes.yihuishou === true) continue;
      const date = String(entry.attributes.riqi), paths = dates.get(date);
      if (paths) paths.push(path); else dates.set(date, [path]);
    }
    return new Set([...dates.values()].filter((paths) => paths.length > 1).flat());
  }
  find(id: string): Snapshot | undefined { return this.all().find((entry) => String(entry.attributes.biaoshi).toLowerCase() === id.toLowerCase()); }
  issues(): IndexIssue[] {
    this.active(); const issues = [...this.failures.values()];
    for (const [path, entry] of this.entries) if (!entry.validation.ok) issues.push({ path, code: "validation", message: entry.validation.errors.map((error) => `${error.field}: ${error.message}`).join("；") });
    for (const path of this.duplicates()) issues.push({ path, code: "duplicate_id", message: "标识重复，所有争议文件均排除正常查询" });
    for (const path of this.duplicateDiaries()) issues.push({ path, code: "duplicate_diary", message: "同日存在多篇有效日记，保留文件并排除正常查询，需人工确认" });
    return cloneData(issues);
  }
  get initialized(): boolean { return this.ready && !this.stopped; }
  stop(): void { this.stopped = true; this.listeners.clear(); this.entries.clear(); this.failures.clear(); }
}
