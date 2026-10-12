import type { Snapshot } from "../ports/entity-store";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { OperationRequest } from "../ports/operation";
import { jindu, type Jilu, type Jindu } from "../domain/entities";
import { changeProgress } from "../domain/progress";
import { isRiqi } from "../domain/date";
import { cloneData } from "../storage/data-values";
import type { EntityIndex } from "./entity-index";
import type { OperationService } from "./operation-service";
export interface ProjectInput { start: string; end: string; progress: Jindu; body: string }
export interface ProjectDraft { readonly id: string }
interface Pending { source: Snapshot; input: ProjectInput; request: OperationRequest; started: boolean; running?: Promise<void> }
export class ProjectService {
  private drafts = new WeakMap<ProjectDraft, Pending>();
  constructor(private readonly index: EntityIndex, private readonly operations: Pick<OperationService, "run">, private readonly clock: Clock, private readonly ids: IdGenerator, private readonly active: () => boolean) {}
  subscribe(listener: () => void): () => void { return this.index.subscribe(listener); }
  list(text = "", page = 1) {
    const rows = this.index.all().filter((row) => row.attributes.shiti === "xiangmu" && `${row.path.split("/").pop()}\n${row.body}`.toLocaleLowerCase().includes(text.trim().toLocaleLowerCase())).sort((a, b) => a.path.localeCompare(b.path));
    const pages = Math.max(1, Math.ceil(rows.length / 50)), current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
    return { ready: this.index.initialized, issues: this.index.issues().length, total: rows.length, pages, page: current, items: rows.slice((current - 1) * 50, current * 50) };
  }
  board(text = "", requested: Partial<Record<Jindu, number>> = {}, includeInactive = false) {
    if (!this.active()) throw new Error("LifeOS 已停止");
    const words = text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const rows = this.index.all().filter(row => row.attributes.shiti === "xiangmu"
      && (includeInactive || (!row.attributes.yiquxiao && !row.attributes.yiguidang))
      && words.every(word => [row.path.split("/").pop(), row.body, ...(row.attributes.biaoqian as string[] ?? [])].join("\n").toLocaleLowerCase().includes(word)))
      .sort((a, b) => String(a.attributes.jiezhiriqi ?? "9999").localeCompare(String(b.attributes.jiezhiriqi ?? "9999")) || a.path.localeCompare(b.path));
    const columns = jindu.map(progress => {
      const matches = rows.filter(row => row.attributes.jindu === progress), pages = Math.max(1, Math.ceil(matches.length / 50));
      const page = Math.min(pages, Math.max(1, Math.floor(requested[progress] ?? 1) || 1));
      return { progress, total: matches.length, page, pages, items: matches.slice((page - 1) * 50, page * 50) };
    });
    return { ready: this.index.initialized, issues: this.index.issues().length, total: rows.length, columns };
  }
  detail(id: string) {
    const key = id.toLowerCase(), project = this.index.find(key);
    if (!project || project.attributes.shiti !== "xiangmu") return undefined;
    const tasks = this.index.all().filter((row) => row.attributes.shiti === "daiban" && (row.attributes.guanlian as string[]).some((ref) => ref.toLowerCase() === key));
    const valid = tasks.filter((row) => !row.attributes.yiquxiao), completed = valid.filter((row) => row.attributes.jindu === "yiwancheng").length;
    return { project, tasks, completed, total: valid.length, ratio: valid.length ? completed / valid.length : null };
  }
  private async current(source: Snapshot): Promise<Snapshot> {
    if (!this.active()) throw new Error("LifeOS 已停止");
    await this.index.rebuild(); if (!this.active()) throw new Error("LifeOS 已停止");
    const current = this.index.find(String(source.attributes.biaoshi));
    if (!current || current.attributes.shiti !== "xiangmu" || current.path !== source.path || current.version.original !== source.version.original) throw new Error("原项目已变化或不可用，请重新打开核对");
    return current;
  }
  private checkCompletion(source: Snapshot, input: ProjectInput): void {
    if (source.attributes.jindu !== "yiwancheng" && input.progress === "yiwancheng") {
      const detail = this.detail(String(source.attributes.biaoshi));
      if (detail?.tasks.some((row) => row.attributes.jindu !== "yiwancheng" && !row.attributes.yiquxiao)) throw new Error("项目仍有未完成待办，请先处理；请使用项目关闭按钮选择保留/取消/移出");
    }
  }
  async prepare(source: Snapshot, input: ProjectInput): Promise<ProjectDraft> {
    const captured = cloneData(source), data = cloneData(input), current = await this.current(captured);
    if ((data.start && !isRiqi(data.start)) || (data.end && !isRiqi(data.end)) || (data.start && data.end && data.start > data.end)) throw new Error("开始日期不能晚于截止日期，且日期必须有效");
    if (typeof data.body !== "string") throw new Error("项目正文需要文本");
    if (current.attributes.jindu === "yiwancheng" && data.progress !== "yiwancheng") throw new Error("项目请使用项目重开按钮核对管理标记");
    this.checkCompletion(current, data);
    if (current.attributes.jindu !== "yiwancheng" && data.progress === "yiwancheng") throw new Error("请使用项目关闭按钮，先保存日期和正文修改");
    const next = changeProgress(current.attributes as Jilu, data.progress, this.clock.now()), set: Record<string, unknown> = { jindu: data.progress }, unset: string[] = [];
    for (const [key, value] of [["kaishiriqi", data.start], ["jiezhiriqi", data.end]] as const) { if (value) set[key] = value; else unset.push(key); }
    if (next.wanchengshijian) set.wanchengshijian = next.wanchengshijian; else unset.push("wanchengshijian");
    const draft = Object.freeze({ id: String(current.attributes.biaoshi) });
    this.drafts.set(draft, { source: current, input: data, started: false, request: { caozuobiaoshi: this.ids.next(), buzhou: [{ caozuoleixing: "gengxin", banben: current.version, xiugai: { set, unset, body: data.body } }] } }); return draft;
  }
  execute(draft: ProjectDraft): Promise<void> {
    const pending = this.drafts.get(draft); if (!pending) return Promise.reject(new Error("项目保存请求无效")); if (pending.running) return pending.running;
    const work = (async () => {
      if (!this.active()) throw new Error("LifeOS 已停止");
      if (!pending.started) { const current = await this.current(pending.source); this.checkCompletion(current, pending.input); pending.started = true; }
      await this.operations.run(pending.request); if (this.active()) await this.index.rebuild();
    })(); pending.running = work; void work.finally(() => { delete pending.running; }).catch(() => undefined); return work;
  }
}
