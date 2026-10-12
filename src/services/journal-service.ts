import { isRiqi, jinri, xingqi } from "../domain/date";
import type { Clock } from "../ports/clock";
import { EntityIndex } from "./entity-index";
import { TemplateService, type NoteDraft } from "./template-service";
export interface JournalDay { id?: string; date: string; status: "empty" | "ready" | "blocked"; paths: string[]; weather: string; lunar: string; weekday: string; tags: string[]; body: string; messages: string[] }
export interface JournalDraft { readonly date: string }
export class JournalService {
  private drafts = new WeakMap<JournalDraft, { existing?: string; note?: NoteDraft }>();
  constructor(private readonly index: EntityIndex, private readonly templates: TemplateService, private readonly clock: Clock, private readonly zone: string, private readonly active: () => boolean, private readonly journalRoot: string) {}
  today(): string { return jinri(this.clock.now(), this.zone); }
  subscribe(listener: () => void): () => void { return this.index.subscribe(listener); }
  get ready(): boolean { return this.index.initialized; }
  get issueCount(): number { return this.ready ? this.index.issues().filter((issue) => issue.path.startsWith(`${this.journalRoot}/`)).length : 0; }
  day(date: string): JournalDay {
    if (!isRiqi(date)) throw new Error("日记日期无效");
    const empty: JournalDay = { date, status: "empty", paths: [], weather: "", lunar: "", weekday: xingqi(date), tags: [], body: "", messages: [] };
    if (!this.ready) return empty;
    const snapshots = this.index.snapshots(), candidates = snapshots.filter((entry) => entry.attributes.shiti === "riji" && entry.attributes.riqi === date && entry.attributes.yihuishou !== true);
    const issues = this.index.issues().filter((issue) => issue.path.startsWith(`${this.journalRoot}/`) && (candidates.some((entry) => entry.path === issue.path) || issue.path.endsWith(`/${date}.md`) && !snapshots.some((entry) => entry.path === issue.path)));
    if (issues.length || candidates.length > 1 || candidates.some((entry) => !entry.validation.ok || !this.index.find(String(entry.attributes.biaoshi)))) return { ...empty, status: "blocked", paths: [...new Set([...candidates.map((entry) => entry.path), ...issues.map((issue) => issue.path)])], messages: [...new Set(issues.map((issue) => issue.message)), ...(candidates.length > 1 ? ["同日存在多篇日记，请人工核对；不会自动合并或删除。"] : [])] };
    const entry = candidates[0];
    if (!entry) {
      const recycled = snapshots.find((entry) => entry.attributes.yihuishou === true && entry.path === `${this.journalRoot}/${date.slice(0, 7)}/${date}.md`);
      return recycled ? { ...empty, status: "blocked", paths: [recycled.path], messages: ["原位置已有回收的日记，请恢复或核对原件，不会覆盖。"] } : empty;
    }
    const a = entry.attributes;
    return { ...empty, id: String(a.biaoshi), status: "ready", paths: [entry.path], weather: String(a.tianqi ?? ""), weekday: String(a.xingqi), lunar: String(a.nongli), tags: Array.isArray(a.biaoqian) ? [...a.biaoqian] as string[] : [], body: entry.body, messages: [] };
  }
  month(month: string): JournalDay[] {
    if (!/^\d{4}-\d{2}$/.test(month) || !isRiqi(`${month}-01`)) throw new Error("月份无效");
    const days: JournalDay[] = [];
    for (let n = 1; n <= 31; n++) { const date = `${month}-${String(n).padStart(2, "0")}`; if (isRiqi(date)) days.push(this.day(date)); }
    return days;
  }
  async prepare(date: string): Promise<JournalDraft> {
    if (!this.active()) throw new Error("日记服务已停止");
    if (!isRiqi(date)) throw new Error("日记日期无效");
    await this.index.rebuild(); const current = this.day(date);
    if (current.status === "blocked") throw new Error("该日有日记冲突或字段错误，请先核对原文件");
    const pending = current.status === "ready" ? { existing: current.paths[0]! } : { note: await this.templates.prepare("riji", "", date) };
    const draft = Object.freeze({ date }); this.drafts.set(draft, pending); return draft;
  }
  async execute(draft: JournalDraft): Promise<string> {
    if (!this.active()) throw new Error("日记服务已停止");
    const pending = this.drafts.get(draft); if (!pending) throw new Error("日记请求无效");
    if (pending.note) return this.templates.execute(pending.note);
    await this.index.rebuild(); const current = this.day(draft.date);
    if (current.status !== "ready") throw new Error("日记已变化，请重新选择日期并核对");
    return current.paths[0]!;
  }
}
