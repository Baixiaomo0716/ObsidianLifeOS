import type { Clock } from "../ports/clock";
import type { Shiti } from "../domain/entities";
import { jinduZiduan } from "../domain/entities";
import { jinri, isRiqi, isShijian } from "../domain/date";
import { jizhangHuizong } from "../domain/money";
import type { EntityIndex } from "./entity-index";
export interface SummaryItem { id: string; type: Shiti; title: string; updated: string }
export interface HomeSummary { ready: boolean; today: string; issues: number; ongoing: SummaryItem[]; tasks: SummaryItem[]; recent: SummaryItem[]; expense?: number; moneyError?: string; zone?: string; todayJournal?: SummaryItem; journalEnabled?: boolean; week?: { start: string; journals?: number | undefined; tasks?: number | undefined; books?: number | undefined; expense?: number | undefined; moneyError?: string | undefined } }
export class SummaryService {
  constructor(private readonly index: EntityIndex, private readonly clock: Clock, private readonly zone: string, private readonly allowed: readonly Shiti[]) {}
  subscribe(listener: () => void): () => void { return this.index.subscribe(listener); }
  read(): HomeSummary {
    const today = jinri(this.clock.now(), this.zone), result: HomeSummary = { ready: this.index.initialized, today, issues: this.index.issues().length, ongoing: [], tasks: [], recent: [] };
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
    const money: { shouzhi: "shouru" | "zhichu"; jine: number }[] = [];
    const weeklyMoney: typeof money = [];
    for (const row of records) {
      const a = row.attributes, type = a.shiti as Shiti;
      const item: SummaryItem = { id: String(a.biaoshi), type, title: type === "jizhang" ? `${a.riqi} ${a.fenlei}` : row.path.split("/").pop()!.replace(/\.md$/i, ""), updated: String(a.gengxinshijian) };
      result.recent.push(item);
      const progress = jinduZiduan(type), available = !a.yiquxiao && !a.yiguidang;
      if (type === "riji") {
        if (inWeek(a.riqi)) week.journals!++;
        if (a.riqi === today && (!result.todayJournal || Date.parse(item.updated) > Date.parse(result.todayJournal.updated))) result.todayJournal = item;
      }
      if (available && type === "daiban" && a.jindu === "yiwancheng" && inWeek(a.wanchengshijian)) week.tasks!++;
      if (available && type === "yuedu" && a.zhuangtai === "yiwancheng" && inWeek(a.duwanshijian ?? a.wanchengshijian)) week.books!++;
      if (type === "jizhang" && inWeek(a.riqi)) weeklyMoney.push({ shouzhi: a.shouzhi as "shouru" | "zhichu", jine: a.jine as number });
      if (progress && a[progress] === "jinxingzhong" && available) result.ongoing.push(item);
      if (type === "daiban" && available && a.jindu !== "yiwancheng" && !(typeof a.jiezhiriqi === "string" && a.jiezhiriqi < today) && (a.kaishiriqi === today || a.jiezhiriqi === today)) result.tasks.push(item);
      if (type === "jizhang" && a.riqi === today) money.push({ shouzhi: a.shouzhi as "shouru" | "zhichu", jine: a.jine as number });
    }
    const sort = (a: SummaryItem, b: SummaryItem) => Date.parse(b.updated) - Date.parse(a.updated) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    result.ongoing.sort(sort); result.tasks.sort(sort); result.recent.sort(sort); result.recent = result.recent.slice(0, 20);
    if (this.allowed.includes("jizhang")) {
      try { result.expense = jizhangHuizong(money).zhichu; }
      catch (error) { result.moneyError = error instanceof Error ? error.message : String(error); }
      try { week.expense = jizhangHuizong(weeklyMoney).zhichu; }
      catch (error) { week.moneyError = error instanceof Error ? error.message : String(error); }
    }
    return result;
  }
}
