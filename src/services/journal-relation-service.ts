import type { Snapshot } from "../ports/entity-store";
import { cloneData } from "../storage/data-values";
import { EntityIndex } from "./entity-index";
import { RelationService, type RelationDraft } from "./relation-service";
import { TemplateService, type NoteDraft } from "./template-service";
import type { NoteType } from "./note-templates";
export interface JournalCreateDraft { readonly type: NoteType }
export interface JournalCreateResult { id: string; selected: string[]; source: Snapshot }
interface Pending { source: Snapshot; selected: string[]; note: NoteDraft; path?: string; id?: string; relation?: RelationDraft; running?: Promise<JournalCreateResult> }
export class JournalRelationService {
  private drafts = new WeakMap<JournalCreateDraft, Pending>();
  constructor(private readonly index: EntityIndex, private readonly templates: TemplateService, private readonly relations: RelationService, private readonly active: () => boolean, readonly types: readonly NoteType[]) {}
  today(): string { return this.templates.today(); }
  async prepare(source: Snapshot, selected: readonly string[], type: NoteType, value: string): Promise<JournalCreateDraft> {
    if (!this.active() || source.attributes.shiti !== "riji" || !this.types.includes(type)) throw new Error("此类型暂不支持从日记新建，请选择已有记录");
    const captured = cloneData(source), selection = [...selected];
    if (type === "riji" && value === captured.attributes.riqi) throw new Error("不能新建并关联当前日记自身，请选择其他日期");
    await this.relations.prepare(captured, selection); // Validate the return context before creating any file.
    const note = await this.templates.prepare(type, type === "riji" ? "" : value, type === "riji" ? value : undefined);
    const draft = Object.freeze({ type }); this.drafts.set(draft, { source: captured, selected: selection, note }); return draft;
  }
  execute(draft: JournalCreateDraft): Promise<JournalCreateResult> {
    const pending = this.drafts.get(draft);
    if (!pending) return Promise.reject(new Error("新建返回请求无效"));
    if (pending.running) return pending.running;
    const work = (async () => {
      if (!this.active()) throw new Error("LifeOS 已停止");
      if (!pending.path) pending.path = await this.templates.execute(pending.note);
      if (!this.active()) throw new Error("笔记已保存，插件已停止，关联未确认");
      try {
        if (!pending.relation) {
          await this.index.rebuild();
          const target = this.index.all().find((entry) => entry.path === pending.path);
          if (!target) throw new Error(`笔记已保存但尚未有效：${pending.path}`);
          pending.id = String(target.attributes.biaoshi).toLowerCase();
          pending.relation = await this.relations.prepare(pending.source, [...pending.selected, pending.id]);
        }
        await this.relations.execute(pending.relation);
      } catch (error) {
        throw new Error(`笔记已保留：${pending.path}；关联未确认完成：${error instanceof Error ? error.message : String(error)}。可重试，或关闭后核对日记并选择已创建笔记。`);
      }
      const source = this.index.find(String(pending.source.attributes.biaoshi));
      if (!source) throw new Error("关联保存已执行，但原日记不可用，请检查完整性");
      return { id: pending.id!, selected: [...source.attributes.guanlian as string[]], source };
    })();
    pending.running = work; void work.finally(() => { delete pending.running; }).catch(() => undefined); return work;
  }
}
