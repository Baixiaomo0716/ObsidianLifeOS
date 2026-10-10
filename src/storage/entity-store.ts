import { StoreError } from "../domain/errors";
import type { Jilu } from "../domain/entities";
import { isShijian } from "../domain/date";
import { editableFields, uuidV4, validateRecord, type Issue } from "../domain/validation";
import type { Clock } from "../ports/clock";
import type { FileSystem } from "../ports/file-system";
import type { ContentVersion, Edit, EntityStore, Snapshot } from "../ports/entity-store";
import type { ChangePlan } from "../ports/change-plan";
import { JsonCodec, MarkdownCodec, type Codec } from "./codecs";
import { cloneData, dataObject, hasOwn, sameData } from "./data-values";
import { StorageLayout } from "./paths";

// All stores sharing a FileSystem share one local mutation queue, including creates.
// The queue is not a cross-device lock and is not persisted as operation history.
const mutations = new WeakMap<FileSystem, Promise<void>>();
async function serial<T>(fs: FileSystem, operation: () => Promise<T>): Promise<T> {
  const previous = mutations.get(fs) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.then(() => undefined, () => undefined);
  mutations.set(fs, tail);
  try { return await result; }
  finally { if (mutations.get(fs) === tail) mutations.delete(fs); }
}
function wrap(error: unknown, path?: string): never {
  if (error instanceof StoreError) throw error;
  throw new StoreError("io", "文件操作失败，未确认保存成功", path, error);
}
export class SafeEntityStore implements EntityStore {
  private readonly codec: Codec;
  constructor(protected readonly fs: FileSystem, protected readonly layout: StorageLayout, private readonly clock: Clock, private readonly kind: "note" | "ledger") {
    this.codec = kind === "note" ? new MarkdownCodec() : new JsonCodec();
  }
  private checkPath(path: string): void {
    const type = this.layout.typeFor(path);
    if ((type === "jizhang") !== (this.kind === "ledger")) throw new StoreError("path", "笔记和账本存储入口不能混用", path);
  }
  private snapshot(path: string, raw: string, warnings: Issue[] = []): Snapshot {
    const decoded = this.codec.decode(raw);
    this.layout.assertRecord(path, decoded.attributes);
    const validation = validateRecord(decoded.attributes);
    validation.warnings.push(...warnings);
    return { path, version: { path, original: raw }, attributes: decoded.attributes, body: decoded.body, validation };
  }
  // Scan authoritative text rather than stale metadata. DEV-010 may optimize this
  // only if it maintains the same duplicate/conflict safety guarantees.
  private async assertUnique(id: unknown, ownPath: string, strict: boolean): Promise<Issue[]> {
    const warnings: Issue[] = [];
    if (typeof id !== "string" || !uuidV4.test(id)) return warnings;
    for (const path of await this.fs.list()) {
      if (path === ownPath || !this.layout.isManaged(path)) continue;
      try {
        const raw = await this.fs.read(path);
        const codec = this.layout.typeFor(path) === "jizhang" ? new JsonCodec() : new MarkdownCodec();
        const data = codec.decode(raw).attributes;
        if (typeof data.biaoshi === "string" && data.biaoshi.toLowerCase() === id.toLowerCase()) throw new StoreError("duplicate_id", "标识重复，争议文件只读，请修复后重试", ownPath, { lujing: [ownPath, path] });
      } catch (error) {
        if (error instanceof StoreError && error.code === "duplicate_id") throw error;
        if (error instanceof StoreError && error.code === "inactive") throw error;
        if (strict && error instanceof StoreError && error.code === "not_found") throw new StoreError("conflict", "检查期间文件集合已变化，请重新加载后重试", path, error);
        if (strict && (!(error instanceof StoreError) || error.code === "io")) throw new StoreError("io", "检查管理文件时读取失败，暂停写入", path, error);
        if (strict) throw new StoreError("invalid_format", "管理范围内存在不可检查的文件，暂停写入以保护标识完整性", path, error);
        warnings.push({ field: "biaoshi", message: `无法检查文件标识：${path}` });
      }
    }
    return warnings;
  }
  async read(path: string): Promise<Snapshot> {
    this.checkPath(path);
    try {
      const raw = await this.fs.read(path);
      const snapshot = this.snapshot(path, raw);
      const warnings = await this.assertUnique(snapshot.attributes.biaoshi, path, false);
      snapshot.validation.warnings.push(...warnings);
      return snapshot;
    } catch (error) { return wrap(error, path); }
  }
  planCreate(path: string, record: Jilu, body = ""): ChangePlan {
    this.checkPath(path);
    this.layout.assertRecord(path, record);
    if (typeof body !== "string") throw new StoreError("validation", "正文需要字符串", path);
    const validation = validateRecord(record);
    if (!validation.ok) throw new StoreError("validation", "新记录校验失败", path, validation);
    const raw = this.codec.create(record, body);
    return { caozuoleixing: "chuangjian", lujing: path, mubiaobiaoshi: record.biaoshi, yuanwen: null, mubiaoyuanwen: raw };
  }
  planUpdate(version: ContentVersion, edit: Edit, now: string): ChangePlan {
    this.checkPath(version.path);
    const snapshot = this.snapshot(version.path, version.original);
    if (snapshot.attributes.jiegoubanben !== 2) throw new StoreError("unsupported_version", "未知结构版本只读", version.path);
    if (this.kind === "ledger" && edit.body !== undefined) throw new StoreError("validation", "记账行不支持正文", version.path);
    const set = dataObject(edit.set ?? {}), unset = edit.unset ?? [];
    if (!Array.isArray(unset) || unset.some((key) => typeof key !== "string") || (edit.body !== undefined && typeof edit.body !== "string")) throw new StoreError("validation", "修改请求类型错误");
    const type = this.layout.assertRecord(version.path, snapshot.attributes);
    const allowed = new Set(editableFields(type));
    for (const key of [...Object.keys(set), ...unset]) if (!allowed.has(key) || (hasOwn(set, key) && unset.includes(key))) throw new StoreError("validation", "不能修改身份、未知字段或同时设置并删除字段", version.path, key);
    const attributes = { ...snapshot.attributes, ...cloneData(set) };
    for (const key of unset) delete attributes[key];
    const body = edit.body ?? snapshot.body;
    const changed = !sameData(attributes, snapshot.attributes) || body !== snapshot.body;
    if (changed) {
      if (!isShijian(now) || !isShijian(snapshot.attributes.gengxinshijian) || Date.parse(now) < Date.parse(snapshot.attributes.gengxinshijian)) throw new StoreError("validation", "操作时间无效或早于更新", version.path);
      attributes.gengxinshijian = now;
    }
    const validation = validateRecord(attributes);
    if (!validation.ok) throw new StoreError("validation", "修改后的记录无效", version.path, validation);
    return { caozuoleixing: "gengxin", lujing: version.path, mubiaobiaoshi: String(attributes.biaoshi), yuanwen: version.original,
      mubiaoyuanwen: changed ? this.codec.update(version.original, attributes, body) : version.original };
  }
  // Plans carry a stable result timestamp across journal retries/restarts.
  async commit(plan: ChangePlan): Promise<void> {
    dataObject(plan);
    plan = cloneData(plan);
    const path = plan.lujing;
    this.checkPath(path);
    const after = this.snapshot(path, plan.mubiaoyuanwen);
    if (!after.validation.ok || after.attributes.biaoshi !== plan.mubiaobiaoshi) throw new StoreError("validation", "操作计划目标无效", path);
    if (plan.caozuoleixing === "gengxin" && typeof plan.yuanwen === "string") {
      const before = this.snapshot(path, plan.yuanwen);
      if (before.attributes.jiegoubanben !== 2) throw new StoreError("unsupported_version", "原版本只读", path);
      const allowed = new Set([...editableFields(this.layout.typeFor(path)), "gengxinshijian"]);
      for (const key of new Set([...Object.keys(before.attributes), ...Object.keys(after.attributes)])) {
        if (!allowed.has(key) && (hasOwn(before.attributes, key) !== hasOwn(after.attributes, key) || !sameData(before.attributes[key], after.attributes[key]))) throw new StoreError("validation", "计划改写了身份或未知字段", path, key);
      }
      if (!isShijian(before.attributes.gengxinshijian) || !isShijian(after.attributes.gengxinshijian) || Date.parse(after.attributes.gengxinshijian) < Date.parse(before.attributes.gengxinshijian)) throw new StoreError("validation", "计划更新时间倒退", path);
    } else if (plan.caozuoleixing !== "chuangjian" || plan.yuanwen !== null) throw new StoreError("validation", "操作计划类型错误", path);
    return serial(this.fs, async () => {
      try {
        await this.assertUnique(plan.mubiaobiaoshi, path, true);
        if (plan.yuanwen === null) {
          let current: string | undefined;
          try { current = await this.fs.read(path); } catch (error) { if (!(error instanceof StoreError) || error.code !== "not_found") throw error; }
          if (current !== undefined) {
            if (current !== plan.mubiaoyuanwen) throw new StoreError("conflict", "新建目标已有不同内容，不能重试覆盖", path);
            return;
          }
          await this.fs.create(path, plan.mubiaoyuanwen);
        } else await this.fs.process(path, (current) => {
          if (current === plan.mubiaoyuanwen) return current;
          if (current !== plan.yuanwen) throw new StoreError("conflict", "原文变化，操作暂停", path);
          return plan.mubiaoyuanwen;
        });
        if (await this.fs.read(path) !== plan.mubiaoyuanwen) throw new StoreError("conflict", "写后内容再次变化，请核对文件", path);
      } catch (error) { return wrap(error, path); }
    });
  }
  async create(path: string, record: Jilu, body = ""): Promise<Snapshot> {
    this.checkPath(path);
    if (typeof body !== "string") throw new StoreError("validation", "正文需要字符串", path);
    this.layout.assertRecord(path, record);
    const validation = validateRecord(record);
    if (!validation.ok) throw new StoreError(record.jiegoubanben !== 2 ? "unsupported_version" : "validation", "新记录校验失败", path, validation);
    const raw = this.codec.create(record, body);
    const prepared = this.snapshot(path, raw);
    return serial(this.fs, async () => {
      try {
        await this.assertUnique(prepared.attributes.biaoshi, path, true);
        await this.fs.create(path, raw);
        return this.snapshot(path, raw);
      } catch (error) { return wrap(error, path); }
    });
  }
  async update(version: ContentVersion, edit: Edit): Promise<Snapshot> {
    const path = version.path;
    this.checkPath(path);
    const expected = version.original;
    if (typeof expected !== "string") throw new StoreError("validation", "更新需要完整原文版本", path);
    if (this.kind === "ledger" && edit.body !== undefined) throw new StoreError("validation", "记账行不支持Markdown正文", path);
    if (edit.body !== undefined && typeof edit.body !== "string") throw new StoreError("validation", "正文需要字符串", path);
    const set = cloneData(dataObject(edit.set ?? {}));
    const bodyEdit = edit.body;
    const before = this.snapshot(path, expected);
    const type = this.layout.assertRecord(path, before.attributes);
    if (before.attributes.jiegoubanben !== 2) throw new StoreError("unsupported_version", "未知结构版本只读", path);
    const allowed = new Set(editableFields(type));
    if (edit.unset !== undefined && (!Array.isArray(edit.unset) || edit.unset.some((field) => typeof field !== "string"))) throw new StoreError("validation", "删除字段需要字符串列表", path);
    const unset = [...(edit.unset ?? [])];
    for (const field of [...Object.keys(set), ...unset]) {
      if (!allowed.has(field)) throw new StoreError("validation", "不能改写身份、结构版本、创建时间或未知字段", path, field);
      if (hasOwn(set, field) && unset.includes(field)) throw new StoreError("validation", "同一字段不能同时设置和删除", path, field);
    }
    return serial(this.fs, async () => {
      try {
        await this.assertUnique(before.attributes.biaoshi, path, true);
        const result = await this.fs.process(path, (current) => {
          if (current !== expected) throw new StoreError("conflict", "文件内容已变化，请重新加载或另存副本", path);
          // Decode inside the host guard; no cached metadata or later async write.
          const snapshot = this.snapshot(path, current);
          const attributes = { ...snapshot.attributes, ...set };
          for (const field of unset) delete attributes[field];
          const body = bodyEdit ?? snapshot.body;
          if (sameData(attributes, snapshot.attributes) && body === snapshot.body) {
            if (!snapshot.validation.ok) throw new StoreError("validation", "记录仍有校验错误", path, snapshot.validation);
            return current;
          }
          const now = this.clock.now();
          if (!isShijian(now) || !isShijian(snapshot.attributes.gengxinshijian) || Date.parse(now) < Date.parse(snapshot.attributes.gengxinshijian)) throw new StoreError("validation", "设备时间无效或早于上次更新", path);
          attributes.gengxinshijian = now;
          const validation = validateRecord(attributes);
          if (!validation.ok) throw new StoreError("validation", "修改后的记录校验失败", path, validation);
          this.layout.assertRecord(path, attributes);
          return this.codec.update(current, attributes, body);
        });
        return this.snapshot(path, result);
      } catch (error) { return wrap(error, path); }
    });
  }
}
export class NoteStore extends SafeEntityStore {
  constructor(fs: FileSystem, layout: StorageLayout, clock: Clock) { super(fs, layout, clock, "note"); }
}
export class LedgerStore extends SafeEntityStore {
  constructor(fs: FileSystem, layout: StorageLayout, private readonly ledgerClock: Clock) { super(fs, layout, ledgerClock, "ledger"); }
  recycle(version: ContentVersion): Promise<Snapshot> {
    if (new JsonCodec().decode(version.original).attributes.yihuishou === true) return this.update(version, {});
    return this.update(version, { set: { yihuishou: true, huishoushijian: this.ledgerClock.now() } });
  }
  restore(version: ContentVersion): Promise<Snapshot> {
    return this.update(version, { set: { yihuishou: false }, unset: ["huishoushijian"] });
  }
}
export { serial as withFileMutation };
