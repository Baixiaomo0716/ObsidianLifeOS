import type { Snapshot } from "../ports/entity-store";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { OperationRequest } from "../ports/operation";
import type { Jilu } from "../domain/entities";
import { changeProgress, undoCompletion } from "../domain/progress";
import { isShijian, isRiqi } from "../domain/date";
import { validateRecord } from "../domain/validation";
import { cloneData } from "../storage/data-values";
import type { EntityIndex } from "./entity-index";
import type { OperationService } from "./operation-service";
import type { TemplateService, NoteDraft } from "./template-service";

export const taskActions = ["weikaishi", "jinxingzhong", "yiwancheng", "chexiaowancheng", "quxiao", "huifuquxiao"] as const;
export type TaskAction = typeof taskActions[number];
export interface TaskDraft { readonly action: TaskAction }
interface Pending { path: string; original: string; id: string; request: OperationRequest | null; started: boolean; running?: Promise<void> }
export class TaskService {
  private drafts = new WeakMap<TaskDraft, Pending>();
  constructor(private readonly index: EntityIndex, private readonly templates: TemplateService, private readonly operations: Pick<OperationService, "run">, private readonly clock: Clock, private readonly ids: IdGenerator, private readonly active: () => boolean) {}
  private ensureActive(): void { if (!this.active()) throw new Error("LifeOS 已停止"); }
  subscribe(listener: () => void): () => void { return this.index.subscribe(listener); }
  private dates(start: string, end: string): void {
    if ((start && !isRiqi(start)) || (end && !isRiqi(end)) || (start && end && start > end)) throw new Error("请填写有效日期，开始日期不能晚于截止日期");
  }
  async prepareDates(source: Snapshot, start: string, end: string): Promise<TaskDraft> {
    this.ensureActive(); this.dates(start, end);
    const captured = cloneData(source); await this.index.rebuild(); this.ensureActive();
    const current = this.index.find(String(captured.attributes.biaoshi));
    if (!current || current.attributes.shiti !== "daiban" || current.path !== captured.path || current.version.original !== captured.version.original) throw new Error("原待办已变化，请重新打开，不会覆盖新内容");
    const set: Record<string, unknown> = {}, unset: string[] = [];
    for (const [key, value] of [["kaishiriqi", start], ["jiezhiriqi", end]] as const) if ((current.attributes[key] ?? "") !== value) { if (value) set[key] = value; else unset.push(key); }
    const draft = Object.freeze({ action: "weikaishi" as const });
    this.drafts.set(draft, { path: current.path, original: current.version.original, id: String(current.attributes.biaoshi), started: false,
      request: Object.keys(set).length || unset.length ? { caozuobiaoshi: this.ids.next(), buzhou: [{ caozuoleixing: "gengxin", banben: current.version, xiugai: { set, unset } }] } : null });
    return draft;
  }
  async prepareCreate(title: string): Promise<NoteDraft> { this.ensureActive(); return this.templates.prepare("daiban", title); }
  async executeCreate(draft: NoteDraft): Promise<string> {
    this.ensureActive();
    if (draft.shiti !== "daiban") throw new Error("请选择待办创建请求");
    return this.templates.execute(draft);
  }
  async prepare(source: Snapshot, action: TaskAction): Promise<TaskDraft> {
    this.ensureActive();
    if (!taskActions.includes(action)) throw new Error("待办操作无效");
    const captured = cloneData(source);
    await this.index.rebuild(); this.ensureActive();
    const current = this.index.find(String(captured.attributes.biaoshi));
    if (!current || current.path !== captured.path || current.version.original !== captured.version.original) throw new Error("原待办已变化，请重新打开，不会覆盖新内容");
    if (current.attributes.shiti !== "daiban" || !current.validation.ok) throw new Error("请选择有效待办");
    const record = current.attributes as Jilu, now = this.clock.now();
    if (!isShijian(now) || Date.parse(now) < Date.parse(record.gengxinshijian)) throw new Error("操作时间无效或早于上次更新");
    let next: Record<string, unknown> = { ...record };
    if (action === "quxiao") { next.yiquxiao = true; next.quxiaoshijian = record.quxiaoshijian ?? now; }
    else if (action === "huifuquxiao") { next.yiquxiao = false; delete next.quxiaoshijian; }
    else if (action === "chexiaowancheng") {
      if (record.jindu !== "yiwancheng") throw new Error("只有已完成待办可以撤销完成");
      next = { ...undoCompletion(record, now) };
    }
    else next = { ...changeProgress(record, action, now) };
    if (!validateRecord(next).ok) throw new Error("待办操作后字段无效");
    const keys = ["jindu", "wanchengshijian", "yiquxiao", "quxiaoshijian"], set: Record<string, unknown> = {}, unset: string[] = [];
    for (const key of keys) if (record[key] !== next[key]) { if (next[key] === undefined) unset.push(key); else set[key] = next[key]; }
    const changed = Object.keys(set).length > 0 || unset.length > 0;
    const draft = Object.freeze({ action });
    this.drafts.set(draft, { path: current.path, original: current.version.original, id: String(record.biaoshi), started: false,
      request: changed ? { caozuobiaoshi: this.ids.next(), buzhou: [{ caozuoleixing: "gengxin", banben: current.version, xiugai: { set, unset } }] } : null });
    return draft;
  }
  execute(draft: TaskDraft): Promise<void> {
    const pending = this.drafts.get(draft);
    if (!pending) return Promise.reject(new Error("待办操作请求无效"));
    if (pending.running) return pending.running;
    const work = (async () => {
      this.ensureActive();
      if (!pending.started) {
        await this.index.rebuild(); this.ensureActive();
        const current = this.index.find(pending.id);
        if (!current || current.path !== pending.path || current.version.original !== pending.original) throw new Error("原待办已变化，请重新打开，不会覆盖新内容");
        pending.started = true;
      }
      // Retrying an attempted save uses its original receipt, including after an uncertain response.
      if (pending.request) await this.operations.run(pending.request);
      if (this.active()) await this.index.changed(pending.path);
    })();
    pending.running = work; void work.finally(() => { delete pending.running; }).catch(() => undefined); return work;
  }
}
