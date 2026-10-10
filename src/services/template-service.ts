import type { FileSystem } from "../ports/file-system";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { OperationRequest } from "../ports/operation";
import type { Jilu } from "../domain/entities";
import { StoreError } from "../domain/errors";
import { jinri, isRiqi } from "../domain/date";
import { deriveDateFields, normalizeInput, validateRecord } from "../domain/validation";
import { MarkdownCodec } from "../storage/codecs";
import { StorageLayout, safePath } from "../storage/paths";
import { cloneData, hasOwn } from "../storage/data-values";
import { EntityIndex } from "./entity-index";
import { OperationService } from "./operation-service";
import { bundledTemplates, noteLabels, type NoteType } from "./note-templates";

export interface NoteDraft { qingqiu: OperationRequest; shiti: NoteType; lujing: string }
const queues = new WeakMap<FileSystem, Promise<void>>();
export class TemplateService {
  constructor(private readonly files: FileSystem, private readonly layout: StorageLayout, private readonly index: EntityIndex,
    private readonly operations: OperationService, private readonly clock: Clock, private readonly ids: IdGenerator, private readonly zone: string,
    private readonly enabled: readonly NoteType[]) {}
  templatePath(type: NoteType): string { return `${this.layout.root}/00_系统/模板/${noteLabels[type]}.md`; }
  today(): string { return jinri(this.clock.now(), this.zone); }
  private checkType(type: NoteType): void {
    if (!hasOwn(noteLabels, type) || !this.enabled.includes(type)) throw new StoreError("validation", "此笔记类型未启用或不支持，记账使用专用表单");
  }
  async install(): Promise<{ lujing: string; jieguo: string }[]> {
    const results: { lujing: string; jieguo: string }[] = [];
    for (const type of Object.keys(noteLabels) as NoteType[]) {
      const path = this.templatePath(type);
      try {
        try { await this.files.read(path); results.push({ lujing: path, jieguo: "已存在，保留" }); continue; }
        catch (error) { if (!(error instanceof StoreError) || error.code !== "not_found") throw error; }
        await this.files.create(path, bundledTemplates[type]); results.push({ lujing: path, jieguo: "已安装" });
      } catch (error) { results.push({ lujing: path, jieguo: `未确认安装：${error instanceof Error ? error.message : String(error)}` }); }
    }
    return results;
  }
  async prepare(type: NoteType, title: string, date?: string): Promise<NoteDraft> {
    this.checkType(type);
    const now = this.clock.now(), name = title.trim(), day = date ?? jinri(now, this.zone);
    if (type === "riji" && !isRiqi(day)) throw new StoreError("validation", "日记日期无效");
    if (type !== "riji" && (!name || name === "{{title}}" || Array.from(name).length > 120)) throw new StoreError("validation", "名称需要1至120个字符");
    let template: string;
    try { template = await this.files.read(this.templatePath(type)); }
    catch (error) { if (!(error instanceof StoreError) || error.code !== "not_found") throw error; template = bundledTemplates[type]; }
    const decoded = new MarkdownCodec().decode(template);
    if (decoded.attributes.shiti !== type || decoded.attributes.jiegoubanben !== 2) throw new StoreError("unsupported_version", "模板类型或结构版本不匹配");
    const display = type === "riji" ? day : name;
    const replace = (text: string): string => {
      const output = text.replaceAll("{{title}}", display).replaceAll("{{date:YYYY-MM-DD}}", day).replaceAll("{{date}}", day).replaceAll("{{time}}", now);
      if (/\{\{[^{}]+\}\}/.test(output)) throw new StoreError("validation", "模板包含不支持的变量，请在模板源中明确填写");
      return output;
    };
    const expand = (value: unknown): unknown => typeof value === "string" ? replace(value) : Array.isArray(value) ? value.map(expand)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)])) : value;
    const attributes = expand(decoded.attributes) as Record<string, unknown>;
    const id = this.ids.next();
    const record = deriveDateFields({ ...attributes, ...normalizeInput(attributes), biaoshi: id, chuangjianshijian: now, gengxinshijian: now,
      ...(type === "riji" ? { riqi: day } : { mingcheng: name }) });
    record.shuxingmoshi = "tongyi";
    record.biaoqian ??= [];
    if (type === "zhishi") record.jindu ??= "weikaishi";
    record.bijishiqu = this.zone;
    if (["riji", "daiban", "xiangmu"].includes(type)) {
      record.bijishiqu = this.zone;
      if (type !== "xiangmu") record.biaoqian ??= [];
      if (type !== "riji") { record.kaishiriqi ??= null; record.jiezhiriqi ??= null; }
    }
    const validation = validateRecord(record);
    if (!validation.ok) throw new StoreError("validation", "模板生成记录校验失败，请检查模板", undefined, validation);
    const base = Array.from(display.replace(/[\\/<>:"|?*\u0000-\u001f]/g, "_")).slice(0, ["daiban", "xiangmu"].includes(type) ? 120 : 48).join("").replace(/[. ]+$/g, "_") || noteLabels[type];
    const path = safePath(type === "riji" ? `${this.layout.module(type)}/${day.slice(0, 7)}/${day}.md` : `${this.layout.module(type)}/${base}.md`);
    return { shiti: type, lujing: path, qingqiu: { caozuobiaoshi: this.ids.next(), buzhou: [{ caozuoleixing: "chuangjian", lujing: path, jilu: record as Jilu, zhengwen: replace(decoded.body) }] } };
  }
  execute(draft: NoteDraft): Promise<string> {
    const captured = cloneData(draft), previous = queues.get(this.files) ?? Promise.resolve();
    const result = previous.then(async () => {
      this.checkType(captured.shiti);
      const action = captured.qingqiu.buzhou[0];
      if (captured.qingqiu.buzhou.length !== 1 || !action || action.caozuoleixing !== "chuangjian" || action.lujing !== captured.lujing || action.jilu.shiti !== captured.shiti) throw new StoreError("validation", "模板创建请求不一致");
      let logged = false;
      try { await this.files.read(this.layout.operationPath(captured.qingqiu.caozuobiaoshi)); logged = true; }
      catch (error) { if (!(error instanceof StoreError) || error.code !== "not_found") throw error; }
      if (captured.shiti === "riji" && !logged) {
        await this.index.rebuild();
        const matching = this.index.snapshots().filter((entry) => entry.attributes.shiti === "riji" && entry.attributes.riqi === action.jilu.riqi && entry.attributes.yihuishou !== true);
        if (matching.length > 1 || matching.some((entry) => !entry.validation.ok || this.index.issues().some((issue) => issue.path === entry.path))) throw new StoreError("conflict", "该日已有争议日记，请先检查完整性");
        if (matching.length === 1) return matching[0]!.path;
      }
      await this.operations.run(captured.qingqiu);
      await this.index.changed(captured.lujing);
      return captured.lujing;
    });
    const tail = result.then(() => undefined, () => undefined); queues.set(this.files, tail);
    void tail.then(() => { if (queues.get(this.files) === tail) queues.delete(this.files); });
    return result;
  }
}
