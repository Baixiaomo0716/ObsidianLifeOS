import type { Snapshot } from "../ports/entity-store";
import type { OperationRequest } from "../ports/operation";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { Settings } from "../settings/settings-store";
import { isRiqi } from "../domain/date";
import { yuanToFen, fenToYuan, jizhangHuizong } from "../domain/money";
import { normalizeInput, deriveDateFields, validateRecord } from "../domain/validation";
import { cloneData } from "../storage/data-values";
import type { EntityIndex } from "./entity-index";
import type { OperationService } from "./operation-service";
import { TrashStore } from "./trash-store";
import { assertLedgerCategory, type LedgerCategory } from "./ledger-rules";
import type { LedgerInput, LedgerDraft } from "./ledger-service";
export interface LedgerQuery { from?: string; to?: string; kind?: string; category?: string; tag?: string; text?: string; recycled?: boolean; page?: number }
interface Pending { source: Snapshot; request: OperationRequest; input?: LedgerInput; started: boolean; running?: Promise<string> }
const csvCell = (value: unknown): string => { const text = String(value); return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`; };
export class LedgerTableService {
  private drafts = new WeakMap<LedgerDraft, Pending>();
  constructor(private readonly index: EntityIndex, private readonly operations: Pick<OperationService, "run">, private readonly clock: Clock, private readonly ids: IdGenerator, private readonly settings: () => Settings, private readonly active: () => boolean) {}
  subscribe(listener: () => void): () => void { return this.index.subscribe(listener); }
  query(query: LedgerQuery = {}) {
    let error: string | undefined;
    if ((query.from && !isRiqi(query.from)) || (query.to && !isRiqi(query.to)) || (query.from && query.to && query.from > query.to)) error = "日期范围无效";
    const problems = new Set(this.index.issues().map((issue) => issue.path));
    const rows = error ? [] : this.index.snapshots().filter((row) => {
      const a = row.attributes;
      return row.validation.ok && !problems.has(row.path) && a.shiti === "jizhang" && (a.yihuishou === true) === (query.recycled === true)
        && (!query.from || String(a.riqi) >= query.from) && (!query.to || String(a.riqi) <= query.to) && (!query.kind || a.shouzhi === query.kind)
        && (!query.category || a.fenlei === query.category) && (!query.tag || (a.biaoqian as string[]).includes(query.tag))
        && (!query.text || `${a.fenlei}\n${(a.biaoqian as string[]).join(" ")}`.toLocaleLowerCase().includes(query.text.trim().toLocaleLowerCase()));
    }).sort((a, b) => String(b.attributes.riqi).localeCompare(String(a.attributes.riqi)) || a.path.localeCompare(b.path));
    let totals: ReturnType<typeof jizhangHuizong> | undefined;
    try { totals = jizhangHuizong(rows.map((row) => row.attributes as unknown as Parameters<typeof jizhangHuizong>[0][number])); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    const pages = Math.max(1, Math.ceil(rows.length / 50)), page = Math.min(pages, Math.max(1, Math.floor(query.page ?? 1) || 1));
    return { ready: this.index.initialized, rows, items: rows.slice((page - 1) * 50, page * 50), total: rows.length, pages, page, totals, error, issues: this.index.issues().length };
  }
  export(query: LedgerQuery, format: "csv" | "json"): string {
    const result = this.query(query);
    if (!result.ready || result.error) throw new Error(result.error ?? "索引尚未就绪");
    if (format === "json") return JSON.stringify(result.rows.map((row) => JSON.parse(row.version.original)), null, 2);
    return "\uFEFF" + [["日期", "星期", "收支", "分类", "标签", "金额（元）", "已回收"], ...result.rows.map(({ attributes: a }) => [a.riqi, a.xingqi, a.shouzhi === "shouru" ? "收入" : "支出", a.fenlei, (a.biaoqian as string[]).join("、"), fenToYuan(a.jine as number), a.yihuishou === true ? "是" : "否"])].map((row) => row.map(csvCell).join(",")).join("\r\n");
  }
  private enabled(): void { if (!this.active() || !this.settings().qiyongmokuai.includes("jizhang")) throw new Error("记账未启用或插件已停止"); }
  private async current(source: Snapshot): Promise<Snapshot> {
    this.enabled(); await this.index.rebuild(); this.enabled();
    const current = this.index.snapshots().find((row) => row.path === source.path);
    if (!current || current.attributes.shiti !== "jizhang" || !current.validation.ok || this.index.issues().some((issue) => issue.path === current.path) || current.version.original !== source.version.original) throw new Error("原记账行已变化或无效，请重新打开核对");
    return current;
  }
  async prepareEdit(source: Snapshot, input: LedgerInput): Promise<LedgerDraft> {
    const captured = cloneData(source), data = cloneData(input), current = await this.current(captured);
    if (current.attributes.yihuishou) throw new Error("请先恢复回收记录再编辑");
    assertLedgerCategory(this.settings(), { shouzhi: data.kind, fenlei: data.category }, current.attributes as unknown as LedgerCategory);
    if (!Array.isArray(data.tags) || data.tags.some((tag) => typeof tag !== "string" || !tag.trim())) throw new Error("标签需要非空文本列表");
    const next = deriveDateFields(normalizeInput({ ...current.attributes, riqi: data.date, shouzhi: data.kind, fenlei: data.category, jine: yuanToFen(data.amount), biaoqian: data.tags }));
    const validation = validateRecord(next); if (!validation.ok) throw new Error(validation.errors.map((v) => v.message).join("；"));
    const set = Object.fromEntries(["riqi", "xingqi", "shouzhi", "fenlei", "jine", "biaoqian"].map((key) => [key, next[key]]));
    const draft = Object.freeze({ id: String(current.attributes.biaoshi) });
    this.drafts.set(draft, { source: current, input: data, started: false, request: { caozuobiaoshi: this.ids.next(), buzhou: [{ caozuoleixing: "gengxin", banben: current.version, xiugai: { set } }] } }); return draft;
  }
  async prepareRecycle(source: Snapshot, recycle: boolean): Promise<LedgerDraft> {
    const current = await this.current(cloneData(source)), action = await new TrashStore(this.index, this.clock).prepare(current, recycle), draft = Object.freeze({ id: String(current.attributes.biaoshi) });
    this.drafts.set(draft, { source: current, started: false, request: { caozuobiaoshi: this.ids.next(), buzhou: [action] } }); return draft;
  }
  execute(draft: LedgerDraft): Promise<string> {
    const pending = this.drafts.get(draft); if (!pending) return Promise.reject(new Error("记账编辑请求无效"));
    if (pending.running) return pending.running;
    const work = (async () => {
      this.enabled();
      if (!pending.started) { const current = await this.current(pending.source); if (pending.input) assertLedgerCategory(this.settings(), { shouzhi: pending.input.kind, fenlei: pending.input.category }, current.attributes as unknown as LedgerCategory); pending.started = true; }
      await this.operations.run(pending.request); if (this.active()) await this.index.rebuild(); return draft.id;
    })();
    pending.running = work; void work.finally(() => { delete pending.running; }).catch(() => undefined); return work;
  }
}
