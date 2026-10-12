import type { Snapshot } from "../ports/entity-store";
import { cloneData } from "../storage/data-values";
import type { EntityIndex } from "./entity-index";
import type { LedgerDraft, LedgerInput, LedgerService } from "./ledger-service";
import type { RelationDraft, RelationService } from "./relation-service";
import type { JournalCreateResult } from "./journal-relation-service";
interface Pending { source: Snapshot; selected: string[]; ledger: LedgerDraft; created: boolean; relation?: RelationDraft; running?: Promise<JournalCreateResult> }
export class JournalLedgerRelationService {
  private drafts = new WeakMap<LedgerDraft, Pending>();
  constructor(private readonly index: EntityIndex, private readonly ledger: LedgerService, private readonly relations: RelationService, private readonly active: () => boolean) {}
  today(): string { return this.ledger.today(); }
  categories(kind: LedgerInput["kind"]): string[] { return this.ledger.categories(kind); }
  async prepare(source: Snapshot, selected: readonly string[], input: LedgerInput): Promise<LedgerDraft> {
    if (!this.active() || source.attributes.shiti !== "riji") throw new Error("请选择有效日记新建关联记账");
    const captured = cloneData(source), selection = [...selected];
    await this.relations.prepare(captured, selection);
    const ledger = this.ledger.prepare(input), draft = Object.freeze({ id: ledger.id });
    this.drafts.set(draft, { source: captured, selected: selection, ledger, created: false }); return draft;
  }
  execute(draft: LedgerDraft): Promise<JournalCreateResult> {
    const pending = this.drafts.get(draft);
    if (!pending) return Promise.reject(new Error("记账新建返回请求无效"));
    if (pending.running) return pending.running;
    const work = (async () => {
      if (!this.active()) throw new Error("LifeOS 已停止");
      if (!pending.created) {
        try { await this.ledger.execute(pending.ledger); pending.created = true; }
        catch (error) { throw new Error(`记账保存尚未确认：${draft.id}；${error instanceof Error ? error.message : String(error)}。请沿用原请求重试，关闭后先核对账本。`); }
      }
      try {
        if (!this.active()) throw new Error("插件已停止");
        pending.relation ??= await this.relations.prepare(pending.source, [...pending.selected, draft.id]);
        await this.relations.execute(pending.relation);
      } catch (error) { throw new Error(`记账已保留：${draft.id}；关联未确认完成：${error instanceof Error ? error.message : String(error)}。可重试，或关闭后选择已创建记账。`); }
      const source = this.index.find(String(pending.source.attributes.biaoshi));
      if (!source) throw new Error("关联保存已执行，原日记不可用，请核对原文件");
      return { id: draft.id, selected: [...source.attributes.guanlian as string[]], source };
    })();
    pending.running = work; void work.finally(() => { delete pending.running; }).catch(() => undefined); return work;
  }
}
