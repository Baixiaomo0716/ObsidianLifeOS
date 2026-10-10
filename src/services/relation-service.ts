import type { Jilu } from "../domain/entities";
import { validateRecord, uuidV4 } from "../domain/validation";
import type { Snapshot } from "../ports/entity-store";
import type { IdGenerator } from "../ports/id-generator";
import type { OperationRequest } from "../ports/operation";
import { cloneData } from "../storage/data-values";
import { EntityIndex } from "./entity-index";
import { OperationService } from "./operation-service";

export interface RelationDraft { readonly selected: readonly string[] }
interface Pending { request: OperationRequest; source: Snapshot; selected: string[]; started: boolean; running?: Promise<void> }
export class RelationService {
  private drafts = new WeakMap<RelationDraft, Pending>();
  constructor(private readonly index: EntityIndex, private readonly operations: Pick<OperationService, "run">, private readonly ids: IdGenerator, private readonly active: () => boolean) {}
  private check(source: Snapshot, selected: readonly string[]): string[] {
    if (!this.active()) throw new Error("LifeOS 已停止");
    if (!source.validation.ok || !["riji", "daiban"].includes(String(source.attributes.shiti)) || source.attributes.yihuishou === true) throw new Error("请选择字段有效的日记或待办编辑关联");
    const previous = (source.attributes.guanlian as string[]).map((id) => id.toLowerCase());
    if (!Array.isArray(selected) || selected.some((id) => typeof id !== "string" || !uuidV4.test(id))) throw new Error("关联标识无效");
    const unique = [...new Set(selected.map((id) => id.toLowerCase()))];
    const targets = new Map(this.index.all().map((entry) => [String(entry.attributes.biaoshi).toLowerCase(), entry.attributes as Jilu]));
    for (const id of unique) if (!targets.has(id) && !previous.includes(id)) throw new Error("新增关联目标不存在、已回收或存在争议，请重新选择");
    const validation = validateRecord({ ...source.attributes, guanlian: unique }, { targets, previous });
    if (!validation.ok) throw new Error(validation.errors.map((error) => error.message).join("；"));
    return unique;
  }
  async prepare(source: Snapshot, selected: readonly string[]): Promise<RelationDraft> {
    const captured = cloneData(source), selection = [...selected];
    await this.index.rebuild();
    const current = this.index.find(String(captured.attributes.biaoshi));
    if (!current || current.path !== captured.path || current.version.original !== captured.version.original) throw new Error("原笔记已变化，请关闭选择器并重新打开；不会覆盖新内容");
    const unique = this.check(current, selection), draft = Object.freeze({ selected: Object.freeze([...unique]) });
    this.drafts.set(draft, { source: current, selected: unique, started: false, request: { caozuobiaoshi: this.ids.next(), buzhou: [{ caozuoleixing: "gengxin", banben: current.version, xiugai: { set: { guanlian: unique } } }] } });
    return draft;
  }
  execute(draft: RelationDraft): Promise<void> {
    const pending = this.drafts.get(draft);
    if (!pending) return Promise.reject(new Error("关联保存请求无效"));
    if (pending.running) return pending.running;
    const work = (async () => {
      if (!this.active()) throw new Error("LifeOS 已停止");
      if (!pending.started) { await this.index.rebuild(); this.check(pending.source, pending.selected); pending.started = true; }
      // Once attempted, repeat the identical journal request to recover an uncertain receipt.
      await this.operations.run(pending.request);
      if (this.active()) await this.index.changed(pending.source.path);
    })();
    pending.running = work;
    void work.finally(() => { delete pending.running; }).catch(() => undefined);
    return work;
  }
}
