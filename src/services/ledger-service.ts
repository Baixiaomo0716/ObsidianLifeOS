import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { OperationRequest } from "../ports/operation";
import type { Jilu } from "../domain/entities";
import { jinri } from "../domain/date";
import { yuanToFen } from "../domain/money";
import { deriveDateFields, normalizeInput, validateRecord } from "../domain/validation";
import { activeCategories, type Settings } from "../settings/settings-store";
import type { StorageLayout } from "../storage/paths";
import type { OperationService } from "./operation-service";
import type { EntityIndex } from "./entity-index";
import { assertLedgerCategory } from "./ledger-rules";
export interface LedgerInput { date: string; kind: "shouru" | "zhichu"; category: string; amount: string; tags: string[] }
export interface LedgerDraft { readonly id: string }
interface Pending { request: OperationRequest; input: LedgerInput; path: string; started: boolean; running?: Promise<string> }
export class LedgerService {
  private drafts = new WeakMap<LedgerDraft, Pending>();
  constructor(private readonly layout: StorageLayout, private readonly operations: Pick<OperationService, "run">, private readonly index: EntityIndex, private readonly clock: Clock, private readonly ids: IdGenerator, private readonly settings: () => Settings, private readonly active: () => boolean) {}
  today(): string { return jinri(this.clock.now(), this.settings().shiqu); }
  categories(kind: LedgerInput["kind"]): string[] { return activeCategories(this.settings(), kind); }
  private check(input: LedgerInput): void {
    if (!this.active() || !this.settings().qiyongmokuai.includes("jizhang")) throw new Error("记账模块未启用或插件已停止");
    assertLedgerCategory(this.settings(), { shouzhi: input.kind, fenlei: input.category });
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string" || !tag.trim())) throw new Error("标签需要非空文本列表");
  }
  prepare(input: LedgerInput): LedgerDraft {
    this.check(input);
    const captured = { ...input, tags: [...input.tags] }, now = this.clock.now(), id = this.ids.next();
    const record = deriveDateFields(normalizeInput({ biaoshi: id, shiti: "jizhang", jiegoubanben: 2, chuangjianshijian: now, gengxinshijian: now,
      riqi: captured.date, shouzhi: captured.kind, fenlei: captured.category, jine: yuanToFen(captured.amount), biaoqian: captured.tags }));
    const validation = validateRecord(record);
    if (!validation.ok) throw new Error(validation.errors.map((error) => error.message).join("；"));
    const draft = Object.freeze({ id }), path = this.layout.ledgerPath(id);
    this.drafts.set(draft, { input: captured, path, started: false, request: { caozuobiaoshi: this.ids.next(), buzhou: [{ caozuoleixing: "chuangjian", lujing: path, jilu: record as Jilu }] } });
    return draft;
  }
  execute(draft: LedgerDraft): Promise<string> {
    const pending = this.drafts.get(draft);
    if (!pending) return Promise.reject(new Error("记账保存请求无效"));
    if (pending.running) return pending.running;
    const work = (async () => {
      if (!this.active()) throw new Error("LifeOS 已停止");
      if (!pending.started) { this.check(pending.input); pending.started = true; }
      await this.operations.run(pending.request);
      if (this.active()) await this.index.rebuild();
      return draft.id;
    })();
    pending.running = work; void work.finally(() => { delete pending.running; }).catch(() => undefined); return work;
  }
}
