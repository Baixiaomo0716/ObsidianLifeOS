import { StoreError } from "../domain/errors";
import { isShijian } from "../domain/date";
import type { Jilu, Shiti } from "../domain/entities";
import { uuidV4, validateRecord } from "../domain/validation";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { FileSystem } from "../ports/file-system";
import type { ChangePlan } from "../ports/change-plan";
import type { Action, DeviceIdentity, Fingerprint, OperationRequest, Receipt } from "../ports/operation";
import { JsonCodec, MarkdownCodec } from "../storage/codecs";
import { assertData, cloneData, dataObject, sameData } from "../storage/data-values";
import { LedgerStore, NoteStore, withFileMutation } from "../storage/entity-store";
import { StorageLayout } from "../storage/paths";

type StepState = "daizhixing" | "yiwancheng" | "shibai" | "chongtu";
interface Step extends ChangePlan { jieguo: StepState }
export interface OperationLog {
  biaoshi: string; jiegoubanben: 2; caozuoleixing: "chuangjian" | "gengxin" | "fuben" | "piliang";
  qingqiu: string; qingqiuzhiwen: string; mubiaobiaoshi: string[]; shebeibiaoshi: string;
  chuangjianshijian: string; gengxinshijian: string; buzhou: Step[];
  cuowu?: { leixing: string; shuoming: string };
}
interface Journal { raw: string; log: OperationLog }
const queues = new WeakMap<FileSystem, Map<string, Promise<void>>>();
async function serial<T>(fs: FileSystem, id: string, work: () => Promise<T>): Promise<T> {
  let map = queues.get(fs);
  if (!map) { map = new Map(); queues.set(fs, map); }
  const result = (map.get(id) ?? Promise.resolve()).then(work, work);
  const tail = result.then(() => undefined, () => undefined);
  map.set(id, tail);
  try { return await result; } finally { if (map.get(id) === tail) map.delete(id); }
}
function failure(error: unknown, path?: string): StoreError {
  return error instanceof StoreError ? error : new StoreError("io", "操作未确认完成，请核对记录后重试", path, error);
}
function operationId(value: unknown): string {
  if (typeof value !== "string" || !uuidV4.test(value)) throw new StoreError("validation", "操作标识需要UUID v4");
  return value.toLowerCase();
}
export function canonical(value: unknown): string {
  assertData(value);
  const order = (item: unknown): unknown => {
    if (typeof item === "number" && Object.is(item, -0)) throw new StoreError("invalid_format", "请求不能包含负零等不能稳定编码的值");
    if (Array.isArray(item)) return item.map(order);
    if (item && typeof item === "object") return Object.fromEntries(Object.keys(item).sort().map((key) => [key, order((item as Record<string, unknown>)[key])]));
    return item;
  };
  return JSON.stringify(order(value));
}
function requestText(actions: readonly Action[]): string {
  if (!Array.isArray(actions) || !actions.length) throw new StoreError("validation", "操作需要至少一步");
  const buzhou = actions.map((action) => {
    if (action.caozuoleixing === "chuangjian") return { caozuoleixing: action.caozuoleixing, lujing: action.lujing, jilu: action.jilu, zhengwen: action.zhengwen ?? "" };
    if (action.caozuoleixing !== "gengxin" && action.caozuoleixing !== "fuben") throw new StoreError("validation", "操作类型未知");
    const { xiugai, banben } = action;
    return { caozuoleixing: action.caozuoleixing, banben: { lujing: banben.path, yuanwen: banben.original },
      xiugai: { shezi: xiugai.set ?? {}, shanchu: xiugai.unset ?? [], ...(xiugai.body !== undefined ? { zhengwen: xiugai.body } : {}) },
      ...(action.caozuoleixing === "fuben" ? { dangqianyuanwen: action.dangqianyuanwen } : {}) };
  });
  return canonical({ buzhou });
}
function actionsFrom(text: string): Action[] {
  const input = new JsonCodec().decode(text).attributes;
  if (!Array.isArray(input.buzhou) || !input.buzhou.length) throw new StoreError("invalid_format", "操作请求缺少步骤");
  const actions = input.buzhou.map((value: unknown): Action => {
    const step = dataObject(value);
    if (step.caozuoleixing === "chuangjian") {
      if (typeof step.lujing !== "string" || typeof step.zhengwen !== "string") throw new StoreError("invalid_format", "新建步骤类型错误");
      return { caozuoleixing: "chuangjian", lujing: step.lujing, jilu: dataObject(step.jilu) as Jilu, zhengwen: step.zhengwen };
    }
    if (step.caozuoleixing !== "gengxin" && step.caozuoleixing !== "fuben") throw new StoreError("invalid_format", "步骤类型未知");
    const version = dataObject(step.banben), edit = dataObject(step.xiugai);
    if (typeof version.lujing !== "string" || typeof version.yuanwen !== "string" || !Array.isArray(edit.shanchu) || edit.shanchu.some((key) => typeof key !== "string") || (edit.zhengwen !== undefined && typeof edit.zhengwen !== "string")) throw new StoreError("invalid_format", "更新步骤类型错误");
    const shared = { banben: { path: version.lujing, original: version.yuanwen }, xiugai: { set: dataObject(edit.shezi), unset: edit.shanchu as string[], ...(edit.zhengwen !== undefined ? { body: edit.zhengwen as string } : {}) } };
    if (step.caozuoleixing === "fuben") {
      if (typeof step.dangqianyuanwen !== "string") throw new StoreError("invalid_format", "副本缺少双方快照");
      return { caozuoleixing: "fuben", ...shared, dangqianyuanwen: step.dangqianyuanwen };
    }
    return { caozuoleixing: "gengxin", ...shared };
  });
  if (requestText(actions) !== text) throw new StoreError("invalid_format", "请求不是完整规范格式，不能恢复");
  return actions;
}
function complete(log: OperationLog): boolean { return log.buzhou.every((step) => step.jieguo === "yiwancheng"); }

export class OperationService {
  private readonly json = new JsonCodec();
  constructor(private readonly fs: FileSystem, private readonly layout: StorageLayout, private readonly notes: NoteStore,
    private readonly ledger: LedgerStore, private readonly clock: Clock, private readonly ids: IdGenerator,
    private readonly device: DeviceIdentity, private readonly fingerprint: Fingerprint) {}
  private store(path: string): NoteStore | LedgerStore { return this.layout.typeFor(path) === "jizhang" ? this.ledger : this.notes; }
  private plan(action: Action, now: string, copyId?: string): ChangePlan {
    if (action.caozuoleixing === "chuangjian") return this.store(action.lujing).planCreate(action.lujing, action.jilu, action.zhengwen ?? "");
    const planned = this.store(action.banben.path).planUpdate(action.banben, action.xiugai, now);
    if (action.caozuoleixing !== "fuben") return planned;
    if (action.dangqianyuanwen === action.banben.original) throw new StoreError("validation", "原文未变化，请使用普通保存");
    const type = this.layout.typeFor(action.banben.path), codec = type === "jizhang" ? this.json : new MarkdownCodec();
    const decoded = codec.decode(planned.mubiaoyuanwen);
    const id = copyId ?? this.ids.next().toLowerCase();
    if (!uuidV4.test(id) || id.toLowerCase() === planned.mubiaobiaoshi.toLowerCase()) throw new StoreError("validation", "副本需要新的UUID v4");
    const attributes = { ...decoded.attributes, biaoshi: id, chuangjianshijian: now, gengxinshijian: now };
    if (!validateRecord(attributes).ok) throw new StoreError("validation", "副本校验失败");
    return { caozuoleixing: "fuben", lujing: this.layout.conflictPath(id, type), mubiaobiaoshi: id, yuanwen: null, mubiaoyuanwen: codec.create(attributes, decoded.body) };
  }
  private async hash(text: string): Promise<string> {
    const hash = await this.fingerprint.of(text);
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new StoreError("unsupported_capability", "操作指纹格式无效");
    return hash;
  }
  private async load(id: string): Promise<Journal | null> {
    const path = this.layout.operationPath(id);
    let raw: string;
    try { raw = await this.fs.read(path); } catch (error) { if (error instanceof StoreError && error.code === "not_found") return null; throw failure(error, path); }
    const data = this.json.decode(raw).attributes;
    if (data.jiegoubanben !== 2) throw new StoreError("unsupported_version", "操作日志版本未知，只读", path);
    if (data.biaoshi !== id.toLowerCase() || typeof data.shebeibiaoshi !== "string" || !uuidV4.test(data.shebeibiaoshi) || typeof data.qingqiu !== "string" || typeof data.qingqiuzhiwen !== "string"
      || !isShijian(data.chuangjianshijian) || !isShijian(data.gengxinshijian) || Date.parse(data.gengxinshijian) < Date.parse(data.chuangjianshijian) || !Array.isArray(data.buzhou)) throw new StoreError("invalid_format", "操作日志字段非法", path);
    if (await this.hash(data.qingqiu) !== data.qingqiuzhiwen) throw new StoreError("operation_mismatch", "操作日志请求指纹不一致", path);
    const actions = actionsFrom(data.qingqiu);
    const persistedSteps = data.buzhou;
    if (actions.length !== persistedSteps.length) throw new StoreError("invalid_format", "操作步骤数量不一致", path);
    const plans = actions.map((action, index) => {
      const step = dataObject(persistedSteps[index]);
      if (!["daizhixing", "yiwancheng", "shibai", "chongtu"].includes(String(step.jieguo))) throw new StoreError("invalid_format", "步骤状态未知", path);
      const plan = this.plan(action, data.chuangjianshijian as string, action.caozuoleixing === "fuben" ? String(step.mubiaobiaoshi) : undefined);
      for (const key of Object.keys(plan) as (keyof ChangePlan)[]) if (!sameData(step[key], plan[key])) throw new StoreError("operation_mismatch", "步骤内容与原请求不一致，禁止恢复", path);
      return plan;
    });
    if (new Set(plans.map((plan) => plan.lujing.toLowerCase())).size !== plans.length || new Set(plans.map((plan) => plan.mubiaobiaoshi.toLowerCase())).size !== plans.length) throw new StoreError("invalid_format", "操作包含重复路径或标识", path);
    if (data.cuowu !== undefined) {
      const error = dataObject(data.cuowu);
      if (typeof error.leixing !== "string" || typeof error.shuoming !== "string") throw new StoreError("invalid_format", "日志错误描述类型非法", path);
    }
    const kind = actions.length > 1 ? "piliang" : actions[0]!.caozuoleixing;
    if (data.caozuoleixing !== kind || !sameData(data.mubiaobiaoshi, plans.map((plan) => plan.mubiaobiaoshi))) throw new StoreError("invalid_format", "日志目标或类型不一致", path);
    // Completed steps must form a prefix; later steps cannot run ahead of failures.
    let pending = false;
    for (const value of data.buzhou) {
      const step = dataObject(value);
      if (pending && step.jieguo !== "daizhixing") throw new StoreError("invalid_format", "后续步骤不能先于待处理步骤执行", path);
      if (step.jieguo !== "yiwancheng") pending = true;
      else if (pending) throw new StoreError("invalid_format", "操作步骤顺序非法", path);
    }
    return { raw, log: data as unknown as OperationLog };
  }
  private receipt(log: OperationLog): Receipt {
    return { caozuobiaoshi: log.biaoshi, buzhou: log.buzhou.map((step) => ({ lujing: step.lujing, mubiaobiaoshi: step.mubiaobiaoshi })) };
  }
  private async own(log: OperationLog): Promise<void> {
    if (complete(log)) return;
    const device = await this.device.get();
    if (!uuidV4.test(device) || device.toLowerCase() !== log.shebeibiaoshi.toLowerCase()) throw new StoreError("foreign_operation", "未完成操作来自其他设备，需要人工核对，不能自动接管");
  }
  private async mark(entry: Journal, index: number, state: StepState, error?: StoreError): Promise<Journal> {
    const now = this.clock.now();
    if (!isShijian(now) || Date.parse(now) < Date.parse(entry.log.gengxinshijian)) throw new StoreError("validation", "日志操作时间无效或倒退");
    const next = cloneData(entry.log);
    next.buzhou[index]!.jieguo = state;
    next.gengxinshijian = now;
    if (error) next.cuowu = { leixing: error.code, shuoming: error.message }; else delete next.cuowu;
    const desired = this.json.create(next as unknown as Record<string, unknown>);
    const path = this.layout.operationPath(entry.log.biaoshi);
    try {
      const raw = await this.fs.process(path, (current) => {
        if (current !== entry.raw) throw new StoreError("conflict", "操作日志被修改，恢复暂停", path);
        return desired;
      });
      if (raw !== desired) throw new StoreError("io", "操作日志未确认保存", path);
      return { raw, log: next };
    } catch (caught) { throw failure(caught, path); }
  }
  private async copy(plan: ChangePlan): Promise<void> {
    const codec = plan.lujing.endsWith(".json") ? this.json : new MarkdownCodec();
    const record = codec.decode(plan.mubiaoyuanwen).attributes;
    if (!validateRecord(record).ok || plan.lujing !== this.layout.conflictPath(plan.mubiaobiaoshi, record.shiti as Shiti) || record.biaoshi !== plan.mubiaobiaoshi) throw new StoreError("validation", "副本路径或字段非法");
    await withFileMutation(this.fs, async () => {
      for (const path of await this.fs.list()) {
        if (path === plan.lujing || (!this.layout.isManaged(path) && !path.startsWith(`${this.layout.root}/99_回收与冲突/chongtu/`))) continue;
        if (!path.endsWith(".md") && !path.endsWith(".json")) continue;
        const attributes = (path.endsWith(".json") ? this.json : new MarkdownCodec()).decode(await this.fs.read(path)).attributes;
        if (typeof attributes.biaoshi === "string" && attributes.biaoshi.toLowerCase() === plan.mubiaobiaoshi.toLowerCase()) throw new StoreError("duplicate_id", "副本标识已被其他文件使用", path);
      }
      let current: string | undefined;
      try { current = await this.fs.read(plan.lujing); } catch (error) { if (!(error instanceof StoreError) || error.code !== "not_found") throw error; }
      if (current !== undefined && current !== plan.mubiaoyuanwen) throw new StoreError("conflict", "副本目标已有其他内容，禁止覆盖", plan.lujing);
      if (current === undefined) await this.fs.create(plan.lujing, plan.mubiaoyuanwen);
      if (await this.fs.read(plan.lujing) !== plan.mubiaoyuanwen) throw new StoreError("conflict", "副本内容再次变化", plan.lujing);
    });
  }
  private async execute(initial: Journal): Promise<Receipt> {
    await this.own(initial.log);
    let entry = initial;
    for (let index = 0; index < entry.log.buzhou.length; index++) {
      const step = entry.log.buzhou[index]!;
      if (step.jieguo === "yiwancheng") continue;
      try {
        if (step.caozuoleixing === "fuben") await this.copy(step);
        else await this.store(step.lujing).commit(step);
      } catch (caught) {
        const error = failure(caught, step.lujing);
        try { await this.mark(entry, index, error.code === "conflict" ? "chongtu" : "shibai", error); }
        catch (journalError) { throw new StoreError("io", "目标或日志保存未确认，请从操作记录核对后恢复", step.lujing, { error, journalError }); }
        throw error;
      }
      // If this fails, the already-written target is retained and checked on resume.
      entry = await this.mark(entry, index, "yiwancheng");
    }
    return this.receipt(entry.log);
  }
  async run(request: OperationRequest): Promise<Receipt> {
    const id = operationId(request.caozuobiaoshi);
    this.layout.operationPath(id);
    const text = requestText(request.buzhou); // Freeze the request before the first await.
    const hash = await this.hash(text);
    return serial(this.fs, id, async () => {
      let entry = await this.load(id);
      if (entry) {
        if (entry.log.qingqiuzhiwen !== hash || entry.log.qingqiu !== text) throw new StoreError("operation_mismatch", "同一操作标识不能用于不同请求");
        return this.execute(entry);
      }
      const actions = actionsFrom(text), time = this.clock.now();
      if (!isShijian(time)) throw new StoreError("validation", "操作时间无效");
      const device = (await this.device.get()).toLowerCase();
      if (!uuidV4.test(device)) throw new StoreError("validation", "本机标识需要UUID v4");
      const plans = actions.map((action) => this.plan(action, time));
      if (new Set(plans.map((plan) => plan.lujing.toLowerCase())).size !== plans.length || new Set(plans.map((plan) => plan.mubiaobiaoshi.toLowerCase())).size !== plans.length) throw new StoreError("validation", "同一批次不能重复操作同一路径或标识");
      const log: OperationLog = { biaoshi: id, jiegoubanben: 2, caozuoleixing: actions.length > 1 ? "piliang" : actions[0]!.caozuoleixing,
        qingqiu: text, qingqiuzhiwen: hash, mubiaobiaoshi: plans.map((plan) => plan.mubiaobiaoshi), shebeibiaoshi: device,
        chuangjianshijian: time, gengxinshijian: time, buzhou: plans.map((plan) => ({ ...plan, jieguo: "daizhixing" })) };
      const raw = this.json.create(log as unknown as Record<string, unknown>);
      try { await this.fs.create(this.layout.operationPath(id), raw); } catch (error) { throw failure(error, this.layout.operationPath(id)); }
      entry = { raw, log };
      return this.execute(entry);
    });
  }
  async resume(id: string): Promise<Receipt> {
    id = operationId(id);
    this.layout.operationPath(id);
    return serial(this.fs, id, async () => {
      const entry = await this.load(id);
      if (!entry) throw new StoreError("not_found", "操作记录不存在");
      return this.execute(entry);
    });
  }
  async inspect(id: string): Promise<OperationLog> {
    const entry = await this.load(operationId(id));
    if (!entry) throw new StoreError("not_found", "操作记录不存在");
    return cloneData(entry.log);
  }
  async listPending(): Promise<{ daichuli: { caozuobiaoshi: string; shebeibiaoshi: string; yiwancheng: number; zongshu: number }[]; cuowu: { lujing: string; shuoming: string }[] }> {
    const daichuli: { caozuobiaoshi: string; shebeibiaoshi: string; yiwancheng: number; zongshu: number }[] = [], cuowu: { lujing: string; shuoming: string }[] = [];
    for (const path of await this.fs.list()) {
      if (!path.startsWith(`${this.layout.root}/00_系统/operations/`) || !path.endsWith(".json")) continue;
      try {
        const id = path.slice(path.lastIndexOf("/") + 1, -5);
        if (this.layout.operationPath(id) !== path) throw new StoreError("path", "日志路径不规范");
        const entry = await this.load(id);
        if (entry && !complete(entry.log)) daichuli.push({ caozuobiaoshi: id, shebeibiaoshi: entry.log.shebeibiaoshi, yiwancheng: entry.log.buzhou.filter((step) => step.jieguo === "yiwancheng").length, zongshu: entry.log.buzhou.length });
      } catch (error) { cuowu.push({ lujing: path, shuoming: failure(error).message }); }
    }
    return { daichuli, cuowu };
  }
}
