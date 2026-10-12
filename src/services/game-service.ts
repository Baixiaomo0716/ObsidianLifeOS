import type { Snapshot } from "../ports/entity-store";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { OperationRequest } from "../ports/operation";
import { jindu, type Jilu, type Jindu } from "../domain/entities";
import { changeProgress } from "../domain/progress";
import { validateRecord } from "../domain/validation";
import { cloneData, sameData } from "../storage/data-values";
import type { EntityIndex } from "./entity-index";
import type { OperationService } from "./operation-service";

export const gameFields = ["leixing", "jianjie", "faxingshijian", "pingjia", "biaoqian"] as const;
export interface GameEdit { fields: Record<string, unknown>; progress: Jindu; body: string }
export interface GameDraft { readonly type: "youxi" }
interface Pending { source: Snapshot; request: OperationRequest | null; started: boolean; running?: Promise<void> }
export class GameService {
  private drafts = new WeakMap<GameDraft, Pending>();
  constructor(private readonly index: EntityIndex, private readonly operations: Pick<OperationService, "run">, private readonly clock: Clock, private readonly ids: IdGenerator, private readonly active: () => boolean) {}
  private ensure(): void { if (!this.active()) throw new Error("LifeOS 已停止"); }
  subscribe(listener: () => void): () => void { return this.index.subscribe(listener); }
  list(text = "", progress = "", tag = "", page = 1, type = "") {
    this.ensure();
    const words = text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const rows = this.index.all().filter(s => {
      const a = s.attributes;
      return a.shiti === "youxi" && (!progress || a.jindu === progress) && (!type || a.leixing === type)
        && (!tag || (a.biaoqian as string[]).some(t => t.toLocaleLowerCase() === tag.trim().replace(/^#/, "").toLocaleLowerCase()))
        && words.every(w => [s.path, s.body, a.leixing, a.jianjie, a.pingjia, ...(a.biaoqian as string[])].join("\n").toLocaleLowerCase().includes(w));
    }).sort((a, b) => String(b.attributes.gengxinshijian).localeCompare(String(a.attributes.gengxinshijian)) || a.path.localeCompare(b.path));
    const pages = Math.max(1, Math.ceil(rows.length / 50)), current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
    return { ready: this.index.initialized, issues: this.index.issues().length, total: rows.length, page: current, pages, items: rows.slice((current - 1) * 50, current * 50) };
  }
  get(id: string): Snapshot | undefined { this.ensure(); const s = this.index.find(id); return s?.attributes.shiti === "youxi" ? s : undefined; }
  private async current(source: Snapshot): Promise<Snapshot> {
    await this.index.rebuild(); this.ensure();
    const s = this.get(String(source.attributes.biaoshi));
    if (!s || s.path !== source.path || s.version.original !== source.version.original) throw new Error("原游戏笔记已变化，请重新打开，不会覆盖新内容");
    return s;
  }
  async prepare(source: Snapshot, input: GameEdit): Promise<GameDraft> {
    this.ensure(); const captured = cloneData(source), edit = cloneData(input);
    if (!jindu.includes(edit.progress) || typeof edit.body !== "string" || !edit.fields || Object.keys(edit.fields).some(k => !gameFields.includes(k as typeof gameFields[number]))) throw new Error("游戏编辑字段无效");
    const current = await this.current(captured), now = this.clock.now();
    let next: Record<string, unknown> = { ...changeProgress(current.attributes as Jilu, edit.progress, now) };
    for (const [key, value] of Object.entries(edit.fields)) {
      if (value === "" || value === undefined || value === null) delete next[key]; else next[key] = value;
    }
    const result = validateRecord(next);
    if (!result.ok) throw new Error(result.errors.map(e => e.message).join("；"));
    const set: Record<string, unknown> = {}, unset: string[] = [];
    for (const key of [...gameFields, "jindu", "wanchengshijian"]) if (!sameData(current.attributes[key], next[key])) {
      if (next[key] === undefined) unset.push(key); else set[key] = next[key];
    }
    const draft = Object.freeze({ type: "youxi" as const });
    this.drafts.set(draft, { source: current, started: false, request: Object.keys(set).length || unset.length || edit.body !== current.body ? {
      caozuobiaoshi: this.ids.next(), buzhou: [{ caozuoleixing: "gengxin", banben: current.version, xiugai: { set, unset, body: edit.body } }]
    } : null });
    return draft;
  }
  execute(draft: GameDraft): Promise<void> {
    const p = this.drafts.get(draft); if (!p) return Promise.reject(new Error("游戏保存请求无效"));
    if (p.running) return p.running;
    const work = (async () => {
      this.ensure(); if (!p.started) { await this.current(p.source); p.started = true; }
      if (p.request) await this.operations.run(p.request);
      if (this.active()) await this.index.changed(p.source.path);
    })();
    p.running = work; void work.finally(() => { delete p.running; }).catch(() => undefined); return work;
  }
}
