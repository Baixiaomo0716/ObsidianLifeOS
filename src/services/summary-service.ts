import type { Clock } from "../ports/clock";
import type { Shiti } from "../domain/entities";
import { jinduZiduan } from "../domain/entities";
import { jinri, isRiqi, isShijian } from "../domain/date";
import { jizhangHuizong } from "../domain/money";
import type { EntityIndex } from "./entity-index";
import { bodyTodos } from "./body-todos";
export interface SummaryItem { id: string; type: Shiti; title: string; updated: string; detail?: string; percent?: number }
export interface BodyTodoItem extends SummaryItem { text: string; line: number }
export interface LifetimeSummary { days: number; notes: number; projects?: number | undefined; tasks?: number | undefined; books?: number | undefined; knowledge?: number | undefined; streak: number; newThisWeek: number; firstDate?: string }
export interface HomeSummary { lifetime?: LifetimeSummary; deadlines?: (SummaryItem & { due: string })[]; bodyTodos?: BodyTodoItem[]; ready: boolean; today: string; issues: number; ongoing: SummaryItem[]; tasks: SummaryItem[]; recent: SummaryItem[]; expense?: number; moneyError?: string; zone?: string; todayJournal?: SummaryItem; journalEnabled?: boolean; week?: { start: string; journals?: number | undefined; tasks?: number | undefined; books?: number | undefined; expense?: number | undefined; moneyError?: string | undefined } }
export class SummaryService {
  constructor(private readonly index: EntityIndex, private readonly clock: Clock, private readonly zone: string, private readonly allowed: readonly Shiti[]) {}
  subscribe(listener: () => void): () => void { return this.index.subscribe(listener); }
  read(): HomeSummary {
    const today = jinri(this.clock.now(), this.zone), result: HomeSummary = { ready: this.index.initialized, today, issues: this.index.issues().length, ongoing: [], tasks: [], recent: [] };
    result.bodyTodos = []; result.deadlines = [];
    if (!result.ready) return result;
    result.zone = this.zone;
    result.journalEnabled = this.allowed.includes("riji");
    const monday = new Date(`${today}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const week = result.week = { start: monday.toISOString().slice(0, 10), journals: this.allowed.includes("riji") ? 0 : undefined, tasks: this.allowed.includes("daiban") ? 0 : undefined, books: this.allowed.includes("yuedu") ? 0 : undefined, expense: undefined as number | undefined, moneyError: undefined as string | undefined };
    const inWeek = (value: unknown) => {
      const date = isRiqi(value) ? value : isShijian(value) ? jinri(value, this.zone) : "";
      return date >= week.start && date <= today;
    };
    const records = this.index.all().filter((row) => this.allowed.includes(row.attributes.shiti as Shiti));
    const lifetime: LifetimeSummary = { days: 0, notes: 0, streak: 0, newThisWeek: 0,
      projects: this.allowed.includes("xiangmu") ? 0 : undefined, tasks: this.allowed.includes("daiban") ? 0 : undefined,
      books: this.allowed.includes("yuedu") ? 0 : undefined, knowledge: this.allowed.includes("zhishi") ? 0 : undefined };
    result.lifetime = lifetime;
    const dates = new Set<string>();
    const money: { shouzhi: "shouru" | "zhichu"; jine: number }[] = [];
    const weeklyMoney: typeof money = [];
    for (const row of records) {
      const a = row.attributes, type = a.shiti as Shiti;
      const recordDate = ["riji", "jizhang"].includes(type) ? a.riqi : a.chuangjianshijian;
      const date = isRiqi(recordDate) ? recordDate : isShijian(recordDate) ? jinri(recordDate, this.zone) : undefined;
      if (date && date <= today) dates.add(date);
      if (type !== "jizhang") { lifetime.notes++; if (inWeek(a.chuangjianshijian)) lifetime.newThisWeek++; }
      if (!a.yiquxiao) {
        if (type === "xiangmu" && a.jindu === "yiwancheng") lifetime.projects!++;
        if (type === "daiban" && a.jindu === "yiwancheng") lifetime.tasks!++;
        if (type === "yuedu" && a.zhuangtai === "yiwancheng") lifetime.books!++;
      }
      if (type === "zhishi") lifetime.knowledge!++;
      const item: SummaryItem = { id: String(a.biaoshi), type, title: type === "jizhang" ? `${a.riqi} ${a.fenlei}` : row.path.split("/").pop()!.replace(/\.md$/i, ""), updated: String(a.gengxinshijian) };
      result.recent.push(item);
      const progress = jinduZiduan(type), available = !a.yiquxiao && !a.yiguidang;
      if (type === "daiban" && available && a.jindu !== "yiwancheng") {
        for (const todo of bodyTodos(row.body)) result.bodyTodos.push({ ...item, ...todo });
      }
      if (type === "riji") {
        if (inWeek(a.riqi)) week.journals!++;
        if (a.riqi === today && (!result.todayJournal || Date.parse(item.updated) > Date.parse(result.todayJournal.updated))) result.todayJournal = item;
      }
      if (available && type === "daiban" && a.jindu === "yiwancheng" && inWeek(a.wanchengshijian)) week.tasks!++;
      if (available && type === "yuedu" && a.zhuangtai === "yiwancheng" && inWeek(a.duwanshijian ?? a.wanchengshijian)) week.books!++;
      if (type === "jizhang" && inWeek(a.riqi)) weeklyMoney.push({ shouzhi: a.shouzhi as "shouru" | "zhichu", jine: a.jine as number });
      if (available && ["daiban", "xiangmu"].includes(type) && a.jindu !== "yiwancheng" && isRiqi(a.jiezhiriqi)) {
        const end = new Date(today + "T12:00:00Z"); end.setUTCDate(end.getUTCDate() + 7);
        if (a.jiezhiriqi <= end.toISOString().slice(0, 10)) result.deadlines!.push({ ...item, due: a.jiezhiriqi });
      }
      if (progress && a[progress] === "jinxingzhong" && available) {
        if (type === "xiangmu") {
          const refs = new Set((Array.isArray(a.daiban) ? a.daiban : []).map(id => String(id).toLowerCase()));
          const tasks = records.filter(s => s.attributes.shiti === "daiban" && !s.attributes.yiquxiao && refs.has(String(s.attributes.biaoshi).toLowerCase()));
          const done = tasks.filter(s => s.attributes.jindu === "yiwancheng").length;
          item.detail = tasks.length ? `已完成 ${done}/${tasks.length} 项` : "尚未关联待办";
          if (tasks.length) item.percent = Math.round(done / tasks.length * 100);
          if (isRiqi(a.jiezhiriqi)) item.detail += ` · ${a.jiezhiriqi.slice(5).replace("-", "月")}日截止`;
        }
        if (type === "yuedu") item.detail = "正在阅读";
        if (type === "lvxing" && isRiqi(a.kaishiriqi)) {
          const days = Math.round((Date.parse(a.kaishiriqi) - Date.parse(today)) / 86400000);
          item.detail = `${a.kaishiriqi.slice(5).replace("-", "月")}日出发 · ${days > 0 ? `还有 ${days} 天` : days === 0 ? "今天出发" : "旅程进行中"}`;
        }
        result.ongoing.push(item);
      }
      if (type === "daiban" && available && a.jindu !== "yiwancheng" && !(typeof a.jiezhiriqi === "string" && a.jiezhiriqi < today) && (a.kaishiriqi === today || a.jiezhiriqi === today)) result.tasks.push(item);
      if (type === "jizhang" && a.riqi === today) money.push({ shouzhi: a.shouzhi as "shouru" | "zhichu", jine: a.jine as number });
    }
    lifetime.days = dates.size;
    const firstDate = [...dates].sort()[0];
    if (firstDate) lifetime.firstDate = firstDate;
    const cursor = new Date(`${today}T12:00:00Z`);
    if (!dates.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (dates.has(cursor.toISOString().slice(0, 10))) { lifetime.streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
    const sort = (a: SummaryItem, b: SummaryItem) => Date.parse(b.updated) - Date.parse(a.updated) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    result.deadlines.sort((a, b) => a.due.localeCompare(b.due) || sort(a, b)); result.ongoing.sort(sort); result.tasks.sort(sort); result.recent.sort(sort); result.recent = result.recent.slice(0, 20);
    result.bodyTodos.sort((a, b) => sort(a, b) || a.line - b.line);
    if (this.allowed.includes("jizhang")) {
      try { result.expense = jizhangHuizong(money).zhichu; }
      catch (error) { result.moneyError = error instanceof Error ? error.message : String(error); }
      try { week.expense = jizhangHuizong(weeklyMoney).zhichu; }
      catch (error) { week.moneyError = error instanceof Error ? error.message : String(error); }
    }
    return result;
  }
}
