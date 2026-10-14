import { StoreError } from "../domain/errors";
import { isShijian } from "../domain/date";
import { uuidV4 } from "../domain/validation";
import type { BinaryFileSystem, BinaryFingerprint, AttachmentSource } from "../ports/attachment";
import type { FileSystem } from "../ports/file-system";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import { StorageLayout, safePath } from "./paths";
import { JsonCodec } from "./codecs";
import { sameData } from "./data-values";

export interface AttachmentInfo { readonly 标识: string; readonly 项目标识: string; readonly 名称: string; readonly 字节数: number; readonly 类型: string; readonly 导入时间: string; readonly 路径: string; readonly 目录?: string; readonly 摘要: string; readonly 结构版本: 1 }
export interface AttachmentDraft { readonly info: AttachmentInfo }
interface Pending { info: AttachmentInfo; bytes: ArrayBuffer; finished?: boolean; running?: Promise<AttachmentInfo> }
export class AttachmentStore {
  private readonly drafts = new WeakMap<AttachmentDraft, Pending>();
  private readonly codec = new JsonCodec();
  constructor(private readonly files: FileSystem, private readonly binary: BinaryFileSystem, private readonly layout: StorageLayout, private readonly clock: Clock, private readonly ids: IdGenerator, private readonly fingerprint: BinaryFingerprint, private readonly maxBytes: number, private readonly active: () => boolean) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new StoreError("validation", "附件大小限制无效");
  }
  private checkActive(): void { if (!this.active()) throw new StoreError("inactive", "附件操作已停止"); }
  private metadataPath(id: string): string {
    if (!uuidV4.test(id)) throw new StoreError("validation", "附件标识无效");
    return `${this.layout.root}/00_系统/附件/${id.toLowerCase()}.json`;
  }
  private target(project: string, id: string, name: string, folder?: string): string {
    if (!uuidV4.test(project) || !uuidV4.test(id) || !name || name.length > 240 || /[\\/\u0000-\u001f]/.test(name) || [".", ".."].includes(name)) throw new StoreError("path", "附件名称或项目标识无效");
    if (folder !== undefined) {
      safePath(folder);
      const prefix = `${this.layout.module("xiangmu")}/`;
      if (!folder.startsWith(prefix) || folder.slice(prefix.length).includes("/")) throw new StoreError("path", "附件目录必须是项目同名文件夹", folder);
    }
    const extension = /\.[a-z0-9]{1,16}$/i.exec(name)?.[0] ?? "", stem = name.slice(0, extension ? -extension.length : undefined).replace(/[<>:"|?*]/g, "_").replace(/^[. ]+|[. ]+$/g, "").slice(0, 70) || "附件";
    return safePath(`${folder ?? `${this.layout.root}/90_附件/项目/${project.toLowerCase()}`}/${stem}-${id.toLowerCase()}${extension}`);
  }
  private async hash(bytes: ArrayBuffer): Promise<string> {
    const hash = await this.fingerprint.of(bytes);
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new StoreError("unsupported_capability", "附件摘要无效");
    return hash;
  }
  private validate(value: Record<string, unknown>): AttachmentInfo {
    const a = value as unknown as AttachmentInfo;
    if (a.结构版本 !== 1 || typeof a.名称 !== "string" || typeof a.类型 !== "string" || a.类型.length > 200 || !Number.isSafeInteger(a.字节数) || a.字节数 < 0 || !isShijian(a.导入时间) || !/^[a-f0-9]{64}$/.test(a.摘要) || a.路径 !== this.target(a.项目标识, a.标识, a.名称, a.目录)) throw new StoreError("invalid_format", "附件元信息无效，保留原件核对");
    return Object.freeze({ ...a });
  }
  private async metadata(id: string): Promise<AttachmentInfo | undefined> {
    try { const a = this.validate(this.codec.decode(await this.files.read(this.metadataPath(id))).attributes); if (a.标识 !== id.toLowerCase()) throw new StoreError("invalid_format", "附件元信息标识与文件不匹配"); return a; }
    catch (error) { if (error instanceof StoreError && error.code === "not_found") return undefined; throw error; }
  }
  async prepare(source: AttachmentSource, project: string, resumeId?: string, projectFolder?: string): Promise<AttachmentDraft> {
    this.checkActive();
    const name = source.name, size = source.size, type = source.type;
    if (!Number.isSafeInteger(size) || size < 0 || size > this.maxBytes) throw new StoreError("validation", `附件超过大小限制（${this.maxBytes}字节）或大小无效`);
    if (typeof type !== "string" || type.length > 200) throw new StoreError("validation", "附件类型无效");
    const id = (resumeId ?? this.ids.next()).toLowerCase();
    const bytes = (await source.arrayBuffer()).slice(0); this.checkActive();
    if (bytes.byteLength !== size || bytes.byteLength > this.maxBytes) throw new StoreError("validation", "附件实际大小与选择信息不一致");
    const digest = await this.hash(bytes), previous = resumeId ? await this.metadata(id) : undefined;
    const folder = previous?.目录 ?? projectFolder, path = this.target(project, id, name, folder);
    if (resumeId && (!previous || previous.项目标识 !== project.toLowerCase() || previous.名称 !== name || previous.字节数 !== size || previous.类型 !== type || previous.摘要 !== digest || previous.路径 !== path)) throw new StoreError("conflict", "恢复附件与原导入记录不匹配");
    const info = previous ?? this.validate({ 结构版本: 1, 标识: id, 项目标识: project.toLowerCase(), 名称: name, 字节数: size, 类型: type, 导入时间: this.clock.now(), 路径: path, ...(folder ? { 目录: folder } : {}), 摘要: digest });
    const draft = Object.freeze({ info }); this.drafts.set(draft, { info, bytes }); return draft;
  }
  private async verify(info: AttachmentInfo): Promise<void> {
    const bytes = await this.binary.read(info.路径);
    if (bytes.byteLength !== info.字节数 || await this.hash(bytes) !== info.摘要) throw new StoreError("conflict", "附件内容与导入摘要不一致，禁止覆盖", info.路径);
    this.checkActive();
  }
  async read(id: string): Promise<AttachmentInfo> {
    this.checkActive(); const info = await this.metadata(id);
    if (!info) throw new StoreError("not_found", "附件元信息不存在");
    await this.verify(info); return info;
  }
  async verifyPath(path: string): Promise<AttachmentInfo> {
    this.checkActive(); safePath(path);
    const match = /-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\.[a-z0-9]{1,16})?$/i.exec(path);
    if (!match || !(path.startsWith(`${this.layout.root}/90_附件/项目/`) || path.startsWith(`${this.layout.module("xiangmu")}/`))) throw new StoreError("path", "附件不属于受管理的导入文件", path);
    const info = await this.read(match[1]!);
    if (info.路径 !== path) throw new StoreError("path", "附件引用与元信息路径不一致", path);
    return info;
  }
  execute(draft: AttachmentDraft): Promise<AttachmentInfo> {
    const pending = this.drafts.get(draft);
    if (!pending) return Promise.reject(new StoreError("validation", "附件导入请求无效"));
    if (pending.running) return pending.running;
    const work = (async () => {
      this.checkActive(); const info = pending.info, existing = await this.metadata(info.标识);
      if (existing && !sameData(existing, info)) throw new StoreError("conflict", "附件导入记录已变化，禁止覆盖");
      if (pending.finished) { if (!existing) throw new StoreError("not_found", "完成的附件元信息已不存在"); await this.verify(info); return info; }
      if (!existing) {
        try { await this.binary.read(info.路径); throw new StoreError("already_exists", "附件路径已有文件，禁止认领或覆盖", info.路径); }
        catch (error) { if (!(error instanceof StoreError && error.code === "not_found")) throw error; }
        this.checkActive(); await this.files.create(this.metadataPath(info.标识), this.codec.create({ ...info }, ""));
      }
      this.checkActive();
      try { await this.binary.read(info.路径); }
      catch (error) { if (!(error instanceof StoreError && error.code === "not_found")) throw error; this.checkActive(); await this.binary.create(info.路径, pending.bytes.slice(0)); }
      await this.verify(info); pending.finished = true; pending.bytes = new ArrayBuffer(0); return info;
    })();
    pending.running = work; void work.finally(() => { delete pending.running; }).catch(() => undefined); return work;
  }
}
