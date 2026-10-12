import { isRiqi, isShijian, jinri } from "../domain/date";
import { jizhangHuizong } from "../domain/money";
import type { Shiti } from "../domain/entities";
import { EntityIndex } from "./entity-index";
import { SearchService } from "./search-service";
export interface JournalContextItem { id: string; title: string; type: Shiti; reasons: string[]; explicit: boolean }
export interface JournalContext { ready: boolean; automatic: JournalContextItem[]; explicit: { id: string; title?: string; type?: Shiti }[]; totals: { shouru: number; zhichu: number; jieyu: number }; moneyError?: string }
export class JournalContextService {
  constructor(private readonly index: EntityIndex, private readonly search: SearchService, private readonly zone: string, private readonly allowed: readonly Shiti[]) {}
  read(date: string, sourceId?: string): JournalContext {
    if (!isRiqi(date)) throw new Error("日记日期无效");
    const result: JournalContext = { ready: this.index.initialized, automatic: [], explicit: [], totals: { shouru: 0, zhichu: 0, jieyu: 0 } };
    if (!result.ready) return result;
    const records = this.index.all(), source = records.find((entry) => String(entry.attributes.biaoshi).toLowerCase() === sourceId?.toLowerCase());
    const explicitIds = new Set((source?.attributes.guanlian as string[] | undefined ?? []).map((id) => id.toLowerCase()));
    result.explicit = [...explicitIds].map((id) => { const item = this.search.relations(id).target; return item ? { id, title: item.title, type: item.type } : { id }; });
    const dated = (value: unknown): boolean => isRiqi(value) ? value === date : isShijian(value) && jinri(value, this.zone) === date;
    const ledger: { shouzhi: "shouru" | "zhichu"; jine: number }[] = [];
    for (const record of records) {
      const a = record.attributes, type = a.shiti as Shiti, id = String(a.biaoshi).toLowerCase();
      if (type === "riji" || !this.allowed.includes(type)) continue;
      const reasons: string[] = [];
      if (dated(a.chuangjianshijian)) reasons.push("当天新增");
      if (type === "jizhang" && dated(a.riqi)) { reasons.push("当天收支"); ledger.push({ shouzhi: a.shouzhi as "shouru" | "zhichu", jine: a.jine as number }); }
      const fields: Partial<Record<Shiti, [string, string][]>> = { yuedu: [["kaishishijian", "开始阅读"], ["duwanshijian", "读完"]], yingshi: [["guankanshijian", "观看"]], yanchu: [["shijian", "演出"]], daiban: [["kaishiriqi", "开始"], ["jiezhiriqi", "截止"]], xiangmu: [["kaishiriqi", "开始"], ["jiezhiriqi", "截止"]] };
      for (const [key, name] of fields[type] ?? []) if (dated(a[key])) reasons.push(name);
      if (type === "lvxing" && typeof a.kaishiriqi === "string" && a.kaishiriqi <= date && (typeof a.jieshuriqi === "string" ? a.jieshuriqi >= date : a.kaishiriqi === date)) reasons.push("旅行日程");
      if (dated(a.wanchengshijian)) reasons.push("完成");
      if (reasons.length) { const title = type === "jizhang" ? `${a.riqi} ${a.fenlei}` : record.path.split("/").pop()!.replace(/\.md$/i, ""); result.automatic.push({ id, title, type, reasons, explicit: explicitIds.has(id) }); }
    }
    result.automatic.sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
    try { result.totals = jizhangHuizong(ledger); } catch (error) { result.moneyError = error instanceof Error ? error.message : String(error); }
    return result;
  }
}
