import { StoreError } from "../domain/errors";
import { isShijian } from "../domain/date";
import { uuidV4 } from "../domain/validation";
import type { Clock } from "../ports/clock";
import type { FileSystem } from "../ports/file-system";
import type { IdGenerator } from "../ports/id-generator";
import type { DeviceIdentity, Fingerprint } from "../ports/operation";
import { JsonCodec, MarkdownCodec } from "../storage/codecs";
import { cloneData, sameData } from "../storage/data-values";
import { StorageLayout } from "../storage/paths";
import { withFileMutation } from "../storage/entity-store";
import { canonical } from "./operation-service";
import { EntityIndex } from "./entity-index";
export interface Initialization { caozuobiaoshi: string; lujing: string; yuanwen: string; mubiaoyuanwen: string; shebeibiaoshi: string }
const blank = (value: unknown): boolean => value === undefined || value === null || value === "";
export class TemplateInitializer {
  constructor(private readonly files: FileSystem, private readonly layout: StorageLayout, private readonly index: EntityIndex,
    private readonly clock: Clock, private readonly ids: IdGenerator, private readonly device: DeviceIdentity, private readonly fingerprint: Fingerprint) {}
  private verify(request: Initialization): void {
    if (typeof request.lujing !== "string" || typeof request.yuanwen !== "string" || typeof request.mubiaoyuanwen !== "string") throw new StoreError("validation", "初始化内容版本无效");
    if (!uuidV4.test(request.caozuobiaoshi) || !uuidV4.test(request.shebeibiaoshi) || this.layout.typeFor(request.lujing) === "jizhang") throw new StoreError("validation", "初始化请求或类型无效");
    const codec = new MarkdownCodec(), before = codec.decode(request.yuanwen), after = codec.decode(request.mubiaoyuanwen);
    this.layout.assertRecord(request.lujing, before.attributes);
    if (before.attributes.jiegoubanben !== 2) throw new StoreError("unsupported_version", "未知结构版本不能初始化");
    if (!["biaoshi", "chuangjianshijian", "gengxinshijian"].every((field) => blank(before.attributes[field]))) throw new StoreError("validation", "系统身份或时间已有值，不能重新生成，请手工核对");
    if (!uuidV4.test(String(after.attributes.biaoshi)) || !isShijian(after.attributes.chuangjianshijian) || after.attributes.chuangjianshijian !== after.attributes.gengxinshijian) throw new StoreError("validation", "初始化目标身份或时间无效");
    if (before.body !== after.body || !sameData(after.attributes, { ...before.attributes, biaoshi: after.attributes.biaoshi,
      chuangjianshijian: after.attributes.chuangjianshijian, gengxinshijian: after.attributes.gengxinshijian })) throw new StoreError("validation", "初始化只能补齐身份和系统时间，不改业务属性或正文");
  }
  async prepare(path: string): Promise<Initialization> {
    const prefix = `${this.layout.root}/00_系统/chushihua/`;
    const pending: Initialization[] = [];
    for (const journalPath of await this.files.list()) if (journalPath.startsWith(prefix) && journalPath.endsWith(".json")) {
      const log = new JsonCodec().decode(await this.files.read(journalPath)).attributes;
      if (log.jiegoubanben !== 2 || typeof log.qingqiu !== "string") throw new StoreError("unsupported_version", "初始化日志格式或版本未知，保留核对");
      const request = new JsonCodec().decode(log.qingqiu).attributes as unknown as Initialization;
      if (request.lujing === path && log.jieguo === "daizhixing") { this.verify(request); pending.push(request); }
    }
    if (pending.length > 1) throw new StoreError("conflict", "存在多份待恢复初始化，请核对日志");
    if (pending.length === 1) return cloneData(pending[0]!);
    const raw = await this.files.read(path), codec = new MarkdownCodec(), decoded = codec.decode(raw), now = this.clock.now();
    const request = { caozuobiaoshi: this.ids.next(), lujing: path, yuanwen: raw, mubiaoyuanwen: codec.update(raw, { ...decoded.attributes,
      biaoshi: this.ids.next(), chuangjianshijian: now, gengxinshijian: now }, decoded.body), shebeibiaoshi: await this.device.get() };
    this.verify(request); return request;
  }
  async execute(input: Initialization): Promise<void> {
    const request = cloneData(input); this.verify(request);
    if (request.shebeibiaoshi !== await this.device.get()) throw new StoreError("foreign_operation", "其他设备的初始化不可自动接管");
    const text = canonical(request), hash = await this.fingerprint.of(text), path = `${this.layout.root}/00_系统/chushihua/${request.caozuobiaoshi}.json`;
    const codec = new JsonCodec();
    await withFileMutation(this.files, async () => {
      let raw: string;
      try { raw = await this.files.read(path); }
      catch (error) {
        if (!(error instanceof StoreError) || error.code !== "not_found") throw error;
        const initial = codec.create({ jiegoubanben: 2, qingqiu: text, qingqiuzhiwen: hash, jieguo: "daizhixing" }, "");
        await this.files.create(path, initial); raw = initial;
      }
      const log = codec.decode(raw).attributes;
      if (log.jiegoubanben !== 2 || log.qingqiu !== text || log.qingqiuzhiwen !== hash || !["daizhixing", "yiwancheng"].includes(String(log.jieguo))) throw new StoreError("operation_mismatch", "初始化日志变化或版本不匹配");
      if (log.jieguo === "yiwancheng") return;
      await this.index.rebuild();
      const id = new MarkdownCodec().decode(request.mubiaoyuanwen).attributes.biaoshi;
      if (this.index.issues().some((issue) => ["io", "invalid_format", "path", "not_found"].includes(issue.code))) throw new StoreError("validation", "存在无法检查身份的文件，暂停初始化");
      if (this.index.snapshots().some((entry) => entry.path !== request.lujing && String(entry.attributes.biaoshi).toLowerCase() === String(id).toLowerCase())) throw new StoreError("duplicate_id", "初始化标识与其他记录重复");
      await this.files.process(request.lujing, (current) => {
        if (current === request.mubiaoyuanwen) return current;
        if (current !== request.yuanwen) throw new StoreError("conflict", "初稿已变化，暂停初始化");
        return request.mubiaoyuanwen;
      });
      await this.files.process(path, (current) => {
        if (current !== raw) throw new StoreError("conflict", "初始化日志已变化");
        return codec.update(current, { ...log, jieguo: "yiwancheng" }, "");
      });
    });
    await this.index.changed(request.lujing);
  }
}
