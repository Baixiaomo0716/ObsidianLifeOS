import { jinduZiduan, type Shiti } from "../domain/entities";
import { EntityIndex } from "./entity-index";
import { jinri, isRiqi } from "../domain/date";

export const typeLabels: Record<Shiti, string> = { riji: "日记", jizhang: "记账", yuedu: "阅读", yingshi: "影视", youxi: "游戏", yanchu: "演出", lvxing: "旅行", zhishi: "知识", daiban: "待办", xiangmu: "项目" };
export const dateFields: Partial<Record<Shiti, readonly [string, string][]>> = {
  riji: [["riqi", "日期"]], jizhang: [["riqi", "日期"]], yuedu: [["kaishishijian", "开始时间"], ["duwanshijian", "读完时间"]],
  yingshi: [["guankanshijian", "观看时间"], ["shangyingshijian", "上映时间"]], youxi: [["faxingshijian", "发行时间"]],
  yanchu: [["shijian", "时间"]], lvxing: [["kaishiriqi", "开始日期"], ["jieshuriqi", "结束日期"]],
  daiban: [["kaishiriqi", "开始日期"], ["jiezhiriqi", "截止日期"]], xiangmu: [["kaishiriqi", "开始日期"], ["jiezhiriqi", "截止日期"]],
};
export interface SearchQuery { type: Shiti | "all"; text?: string; tag?: string; progress?: string; dateField?: string; from?: string; to?: string; page?: number; allowed?: readonly Shiti[] }
export interface SearchItem { id: string; path: string; type: Shiti; title: string; tags: string[]; progress: string | undefined; date: string; references: string[] }
export interface SearchResult { ready: boolean; issues: number; total: number; page: number; pages: number; items: SearchItem[]; error?: string }
function tagKey(value: string): string { return value.trim().replace(/^#/, "").toLocaleLowerCase(); }
export class SearchService {
  constructor(private readonly index: EntityIndex, private readonly zone: string) {}
  subscribe(listener: () => void): () => void { return this.index.subscribe(listener); }
  private records() {
    return this.index.all().map((snapshot) => {
      const a = snapshot.attributes, type = a.shiti as Shiti, field = jinduZiduan(type);
      const item: SearchItem = {
        id: String(a.biaoshi).toLowerCase(), path: snapshot.path, type,
        title: type === "jizhang" ? `${a.riqi} ${a.fenlei} ${a.shouzhi === "shouru" ? "收入" : "支出"} ¥${(Number(a.jine) / 100).toFixed(2)}` : snapshot.path.split("/").pop()!.replace(/\.md$/i, ""),
        tags: Array.isArray(a.biaoqian) ? a.biaoqian.filter((v): v is string => typeof v === "string") : [],
        progress: field && typeof a[field] === "string" ? a[field] as string : undefined,
        date: "", references: Array.isArray(a.guanlian) ? [...new Set(a.guanlian.filter((v): v is string => typeof v === "string").map((v) => v.toLowerCase()))] : [],
      };
      return { snapshot, item };
    });
  }
  query(query: SearchQuery): SearchResult {
    const empty: SearchResult = { ready: this.index.initialized, issues: 0, total: 0, page: 1, pages: 1, items: [] };
    if (!empty.ready) return empty;
    empty.issues = this.index.issues().length;
    if ((query.from && !isRiqi(query.from)) || (query.to && !isRiqi(query.to)) || (query.from && query.to && query.from > query.to)) return { ...empty, error: "请填写有效日期范围，开始日期不能晚于结束日期。" };
    const words = (query.text ?? "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const rows = this.records().filter(({ snapshot, item }) => {
      if (query.allowed && !query.allowed.includes(item.type)) return false;
      if (query.type !== "all" && query.type !== item.type) return false;
      if (query.tag && !item.tags.some((tag) => tagKey(tag) === tagKey(query.tag!))) return false;
      if (query.progress && (query.type === "all" || jinduZiduan(query.type)) && item.progress !== query.progress) return false;
      const fields = dateFields[item.type] ?? [], selected = query.type !== "all" && fields.some(([key]) => key === query.dateField) ? query.dateField : fields[0]?.[0];
      const raw = selected ? snapshot.attributes[selected] : undefined;
      item.date = typeof raw === "string" && raw ? (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : jinri(raw, this.zone)) : "";
      if ((query.from || query.to) && (!item.date || (query.from && item.date < query.from) || (query.to && item.date > query.to))) return false;
      const a = snapshot.attributes;
      const text = [item.title, snapshot.body, ...item.tags, ...[a.neirong, a.jianjie, a.pingjia].filter((v) => typeof v === "string")].join("\n").toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    }).map(({ item }) => item).sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path));
    const pages = Math.max(1, Math.ceil(rows.length / 50)), page = Math.min(pages, Math.max(1, Math.floor(query.page ?? 1) || 1));
    return { ...empty, total: rows.length, pages, page, items: rows.slice((page - 1) * 50, page * 50) };
  }
  tags(type: Shiti | "all", allowed: readonly Shiti[], text = "", requestedPage = 1) {
    const ready = this.index.initialized, groups = new Map<string, { label: string; count: number }>();
    if (ready) for (const { item } of this.records()) {
      if (!allowed.includes(item.type) || (type !== "all" && item.type !== type)) continue;
      const seen = new Set<string>();
      for (const stored of item.tags) {
        const label = stored.trim().replace(/^#/, ""), key = tagKey(stored); if (!key || seen.has(key)) continue; seen.add(key);
        const group = groups.get(key); if (group) group.count++; else groups.set(key, { label, count: 1 });
      }
    }
    const needle = text.trim().replace(/^#/, "").toLocaleLowerCase();
    const rows = [...groups.values()].filter(row => row.label.toLocaleLowerCase().includes(needle)).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const pages = Math.max(1, Math.ceil(rows.length / 50)), page = Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1));
    return { ready, issues: ready ? this.index.issues().length : 0, total: rows.length, page, pages, items: rows.slice((page - 1) * 50, page * 50) };
  }
  relations(id: string): { outgoing: { id: string; target?: SearchItem | undefined }[]; incoming: SearchItem[]; target?: SearchItem | undefined } {
    const rows = this.records().map(({ item }) => item), key = id.toLowerCase(), target = rows.find((item) => item.id === key);
    return { target, outgoing: (target?.references ?? []).map((id) => ({ id, target: rows.find((item) => item.id === id) })), incoming: rows.filter((item) => item.references.includes(key)) };
  }
}


