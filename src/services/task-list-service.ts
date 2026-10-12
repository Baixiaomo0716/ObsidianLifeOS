import type { EntityIndex } from "./entity-index";
import type { Clock } from "../ports/clock";
import { jinri } from "../domain/date";
import type { Snapshot } from "../ports/entity-store";
export type TaskGroup = "shoujixiang" | "jintian" | "yuqi" | "quanbu";
export interface TaskRow { id: string; title: string; source: Snapshot; group: TaskGroup; projects: string[] }
export class TaskListService {
  constructor(private readonly index: EntityIndex, private readonly clock: Clock, private readonly zone: string) {}
  subscribe(listener: () => void): () => void { return this.index.subscribe(listener); }
  query(group: TaskGroup, text = "", page = 1) {
    const today = jinri(this.clock.now(), this.zone), records = this.index.all(), projects = new Set(records.filter((s) => s.attributes.shiti === "xiangmu").map((s) => String(s.attributes.biaoshi).toLowerCase()));
    const rows: TaskRow[] = records.filter((s) => s.attributes.shiti === "daiban").map((source) => {
      const a = source.attributes, refs = (a.guanlian as string[]).filter((id) => projects.has(id.toLowerCase()));
      const pending = a.jindu !== "yiwancheng" && !a.yiquxiao && !a.yiguidang;
      let assigned: TaskGroup = "quanbu";
      if (pending && typeof a.jiezhiriqi === "string" && a.jiezhiriqi < today) assigned = "yuqi";
      else if (pending && (a.kaishiriqi === today || a.jiezhiriqi === today)) assigned = "jintian";
      else if (pending && !a.kaishiriqi && !a.jiezhiriqi && !refs.length) assigned = "shoujixiang";
      return { id: String(a.biaoshi), title: source.path.split("/").pop()!.replace(/\.md$/i, ""), source, group: assigned, projects: refs };
    }).filter((row) => (group === "quanbu" || row.group === group) && `${row.title}\n${row.source.body}\n${(row.source.attributes.biaoqian as string[] ?? []).join(" ")}`.toLocaleLowerCase().includes(text.trim().toLocaleLowerCase()))
      .sort((a, b) => String(a.source.attributes.jiezhiriqi ?? "9999").localeCompare(String(b.source.attributes.jiezhiriqi ?? "9999")) || a.title.localeCompare(b.title));
    const pages = Math.max(1, Math.ceil(rows.length / 50)), current = Math.max(1, Math.min(pages, Math.floor(page) || 1));
    return { ready: this.index.initialized, today, total: rows.length, pages, page: current, items: rows.slice((current - 1) * 50, current * 50), issues: this.index.issues().length };
  }
}
