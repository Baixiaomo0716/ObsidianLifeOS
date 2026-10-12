import type { Clock } from "../ports/clock";
import { jinduZiduan, type Shiti } from "../domain/entities";
import { isRiqi, jinri } from "../domain/date";
import { jizhangHuizong } from "../domain/money";
import { typeLabels } from "./search-service";
import type { EntityIndex } from "./entity-index";
export interface ReviewMetric { key: string; label: string; total: number }
export interface PeriodItem { id: string; type: Shiti; title: string; date: string; bases: string[] }
export interface PeriodResult { ready: boolean; issues: number; from: string; to: string; metrics: ReviewMetric[]; total: number; page: number; pages: number; items: PeriodItem[]; totals?: ReturnType<typeof jizhangHuizong>; moneyError?: string; error?: string }
export function periodRange(period: string): { from: string; to: string } {
  if (/^\d{4}$/.test(period) && isRiqi(`${period}-01-01`)) return { from: `${period}-01-01`, to: `${period}-12-31` };
  if (/^\d{4}-\d{2}$/.test(period) && isRiqi(`${period}-01`)) {
    let day = 31; while (!isRiqi(`${period}-${day}`)) day--;
    return { from: `${period}-01`, to: `${period}-${day}` };
  }
  throw new Error("请选择有效月份或四位年份");
}
export class PeriodReviewService {
  constructor(private readonly index: EntityIndex, private readonly clock: Clock, private readonly zone: string, private readonly allowed: readonly Shiti[]) {}
  subscribe(listener: () => void): () => void { return this.index.subscribe(listener); }
  currentPeriod(): string { return jinri(this.clock.now(), this.zone).slice(0, 7); }
  read(period: string, category = "all", requestedPage = 1): PeriodResult {
    const result: PeriodResult = { ready: this.index.initialized, issues: 0, from: "", to: "", metrics: [], total: 0, page: 1, pages: 1, items: [] };
    try { Object.assign(result, periodRange(period)); } catch (e) { result.error = e instanceof Error ? e.message : String(e); return result; }
    if (!result.ready) return result;
    result.issues = this.index.issues().length;
    const rows = this.index.all().filter(s => this.allowed.includes(s.attributes.shiti as Shiti));
    const groups = new Map<string, PeriodItem[]>();
    for (const type of this.allowed) {
      const definitions = type === "riji" || type === "jizhang" ? [{ field: "riqi", basis: "日期", label: typeLabels[type] }]
        : type === "zhishi" ? [{ field: "chuangjianshijian", basis: "创建时间", label: "新增知识" }, { field: "wanchengshijian", basis: "完成时间", label: "知识完成" }]
        : [{ field: "wanchengshijian", basis: "完成时间", label: `${typeLabels[type]}完成` }];
      for (const def of definitions) {
        const key = `${type}:${def.field}`, matches: PeriodItem[] = [];
        for (const s of rows) {
          const a = s.attributes; if (a.shiti !== type) continue;
          if (def.field === "wanchengshijian" && (a[jinduZiduan(type)!] !== "yiwancheng" || a.yiquxiao === true)) continue;
          const raw = a[def.field]; if (typeof raw !== "string" || !raw) continue;
          const date = def.field === "riqi" ? raw : jinri(raw, this.zone);
          if (date < result.from || date > result.to) continue;
          matches.push({ id: String(a.biaoshi), type, title: type === "jizhang" ? `${a.riqi} ${a.fenlei} ${a.shouzhi === "shouru" ? "收入" : "支出"}` : s.path.split("/").pop()!.replace(/\.md$/i, ""), date, bases: [def.basis] });
        }
        groups.set(key, matches); result.metrics.push({ key, label: def.label, total: matches.length });
      }
    }
    if (this.allowed.includes("jizhang")) {
      const money = rows.filter(s => s.attributes.shiti === "jizhang" && String(s.attributes.riqi) >= result.from && String(s.attributes.riqi) <= result.to);
      try { result.totals = jizhangHuizong(money.map(s => s.attributes as unknown as Parameters<typeof jizhangHuizong>[0][number])); }
      catch (e) { result.moneyError = e instanceof Error ? e.message : String(e); }
    }
    if (category !== "all" && !groups.has(category)) { result.error = "此回顾类型未启用"; return result; }
    const unique = new Map<string, PeriodItem>();
    for (const item of category === "all" ? [...groups.values()].flat() : groups.get(category)!) {
      const previous = unique.get(item.id);
      if (previous) { previous.bases.push(...item.bases); if (item.date > previous.date) previous.date = item.date; }
      else unique.set(item.id, { ...item, bases: [...item.bases] });
    }
    const items = [...unique.values()].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    result.total = items.length; result.pages = Math.max(1, Math.ceil(items.length / 50)); result.page = Math.min(result.pages, Math.max(1, Math.floor(requestedPage) || 1));
    result.items = items.slice((result.page - 1) * 50, result.page * 50); return result;
  }
}
