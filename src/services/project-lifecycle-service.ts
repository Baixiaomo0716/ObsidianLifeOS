import type { Snapshot } from "../ports/entity-store";
import type { FileSystem } from "../ports/file-system";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type { Fingerprint, OperationRequest } from "../ports/operation";
import { isShijian } from "../domain/date";
import { validateRecord, uuidV4 } from "../domain/validation";
import { MarkdownCodec, JsonCodec } from "../storage/codecs";
import type { StorageLayout } from "../storage/paths";
import type { EntityIndex } from "./entity-index";
import type { OperationService } from "./operation-service";
export type TaskDisposition = "baoliu" | "quxiao" | "yichu";
export type ProjectAction = "wancheng" | "chongkai" | "quxiao" | "guidang";
interface SavedSource { path: string; original: string }
interface Plan { id: string; action: ProjectAction; now: string; project: SavedSource; finalId: string; tasks: { source: SavedSource; mode: TaskDisposition; operationId: string }[] }
export interface ProjectFlow { readonly id: string }
interface Pending { plan: Plan; running?: Promise<void> }
export class ProjectLifecycleService {
  private drafts = new WeakMap<ProjectFlow, Pending>();
  private codec = new JsonCodec();
  constructor(private readonly files: FileSystem, private readonly layout: StorageLayout, private readonly index: EntityIndex, private readonly operations: Pick<OperationService, "run">, private readonly clock: Clock, private readonly ids: IdGenerator, private readonly fingerprint: Fingerprint, private readonly active: () => boolean) {}
  private path(id: string): string { if (!uuidV4.test(id)) throw new Error("项目流程标识无效"); return `${this.layout.root}/00_系统/project-flows/${id.toLowerCase()}.json`; }
  private source(saved: SavedSource, type: "xiangmu" | "daiban"): Snapshot {
    if (!saved || typeof saved.original !== "string") throw new Error("项目流程原文件无效");
    const decoded = new MarkdownCodec().decode(saved.original), validation = validateRecord(decoded.attributes);
    if (!validation.ok || validation.value.shiti !== type || this.layout.assertRecord(saved.path, decoded.attributes) !== type) throw new Error("项目流程记录无效");
    return { path: saved.path, version: { path: saved.path, original: saved.original }, attributes: decoded.attributes, body: decoded.body, validation };
  }
  private ensure(): void { if (!this.active()) throw new Error("LifeOS 已停止"); }
  private tasks(id: string): Snapshot[] { return this.index.all().filter((row) => row.attributes.shiti === "daiban" && row.attributes.jindu !== "yiwancheng" && !row.attributes.yiquxiao && (row.attributes.guanlian as string[]).some((ref) => ref.toLowerCase() === id.toLowerCase())); }
  pendingTasks(id: string): Snapshot[] { return this.tasks(id); }
  private requests(plan: Plan): { tasks: { path: string; request?: OperationRequest }[]; final: OperationRequest; projectId: string; kept: Set<string> } {
    if (!uuidV4.test(plan.id) || !uuidV4.test(plan.finalId) || !isShijian(plan.now) || !["wancheng", "chongkai", "quxiao", "guidang"].includes(plan.action) || !Array.isArray(plan.tasks)) throw new Error("项目流程格式无效");
    const project = this.source(plan.project, "xiangmu"), projectId = String(project.attributes.biaoshi), seen = new Set<string>([plan.finalId]), kept = new Set<string>();
    if (Date.parse(plan.now) < Date.parse(String(project.attributes.gengxinshijian))) throw new Error("项目流程时间无效");
    if (plan.action !== "wancheng" && plan.tasks.length) throw new Error("管理操作不能批量改待办");
    const taskIds = new Set<string>();
    const tasks = plan.tasks.map((item) => {
      const row = this.source(item.source, "daiban"), id = String(row.attributes.biaoshi).toLowerCase();
      if (!uuidV4.test(item.operationId) || seen.has(item.operationId) || taskIds.has(id) || !["baoliu", "quxiao", "yichu"].includes(item.mode) || !(row.attributes.guanlian as string[]).some((ref) => ref.toLowerCase() === projectId.toLowerCase()) || row.attributes.jindu === "yiwancheng" || row.attributes.yiquxiao) throw new Error("项目待办处理计划无效");
      seen.add(item.operationId); taskIds.add(id);
      if (item.mode === "baoliu") { kept.add(id); return { path: row.path }; }
      const set = item.mode === "quxiao" ? { yiquxiao: true, quxiaoshijian: plan.now } : { guanlian: (row.attributes.guanlian as string[]).filter((ref) => ref.toLowerCase() !== projectId.toLowerCase()) };
      return { path: row.path, request: { caozuobiaoshi: item.operationId, buzhou: [{ caozuoleixing: "gengxin" as const, banben: row.version, xiugai: { set } }] } };
    });
    const set: Record<string, unknown> = {}, unset: string[] = [];
    if (plan.action === "wancheng") { set.jindu = "yiwancheng"; set.wanchengshijian = project.attributes.wanchengshijian ?? plan.now; }
    if (plan.action === "chongkai") { set.jindu = "jinxingzhong"; set.yiquxiao = false; set.yiguidang = false; unset.push("wanchengshijian", "quxiaoshijian"); }
    if (plan.action === "quxiao") { set.yiquxiao = true; set.quxiaoshijian = project.attributes.quxiaoshijian ?? plan.now; }
    if (plan.action === "guidang") set.yiguidang = true;
    return { tasks, projectId, kept, final: { caozuobiaoshi: plan.finalId, buzhou: [{ caozuoleixing: "gengxin", banben: project.version, xiugai: { set, unset } }] } };
  }
  async prepare(source: Snapshot, action: ProjectAction, choices: Readonly<Record<string, TaskDisposition>> = {}): Promise<ProjectFlow> {
    this.ensure(); const saved = { path: source.path, original: source.version.original }; await this.index.rebuild(); this.ensure();
    const current = this.index.find(String(source.attributes.biaoshi));
    if (!current || current.attributes.shiti !== "xiangmu" || current.path !== saved.path || current.version.original !== saved.original) throw new Error("原项目已变化，请重新打开核对");
    if (action === "wancheng" && this.index.issues().length) throw new Error("存在索引问题，无法确认全部待办，请先核对完整性");
    const tasks = action === "wancheng" ? this.tasks(String(current.attributes.biaoshi)) : [];
    if (tasks.some((row) => !["baoliu", "quxiao", "yichu"].includes(choices[String(row.attributes.biaoshi)] ?? ""))) throw new Error("请为每条未完成待办选择保留、取消或移出");
    const plan: Plan = { id: this.ids.next(), action, now: this.clock.now(), finalId: this.ids.next(), project: saved, tasks: tasks.map((row) => ({ source: { path: row.path, original: row.version.original }, mode: choices[String(row.attributes.biaoshi)]!, operationId: this.ids.next() })) };
    this.requests(plan); const raw = JSON.stringify(plan); this.ensure();
    await this.files.create(this.path(plan.id), this.codec.create({ version: 1, payload: raw, checksum: await this.fingerprint.of(raw) }));
    return this.remember(plan);
  }
  private remember(plan: Plan): ProjectFlow { const draft = Object.freeze({ id: plan.id }); this.drafts.set(draft, { plan }); return draft; }
  describe(draft: ProjectFlow): { path: string; action: ProjectAction; time: string } {
    const pending = this.drafts.get(draft); if (!pending) throw new Error("项目流程无效");
    return { path: pending.plan.project.path, action: pending.plan.action, time: pending.plan.now };
  }
  async plans(): Promise<string[]> { this.ensure(); const prefix = `${this.layout.root}/00_系统/project-flows/`; return (await this.files.list()).filter((path) => path.startsWith(prefix) && path.endsWith(".json")).map((path) => path.slice(prefix.length, -5)).filter((id) => uuidV4.test(id)); }
  async restore(id: string): Promise<ProjectFlow> {
    this.ensure(); const data = this.codec.decode(await this.files.read(this.path(id))).attributes;
    if (data.version !== 1 || typeof data.payload !== "string" || data.checksum !== await this.fingerprint.of(data.payload)) throw new Error("流程文件损坏或被修改，请保留原文件核对");
    const plan = JSON.parse(data.payload) as Plan; if (plan.id.toLowerCase() !== id.toLowerCase()) throw new Error("流程标识与路径不一致"); this.requests(plan); return this.remember(plan);
  }
  execute(draft: ProjectFlow, report: (path: string, status: string) => void = () => {}): Promise<void> {
    const pending = this.drafts.get(draft); if (!pending) return Promise.reject(new Error("项目流程请求无效")); if (pending.running) return pending.running;
    const work = (async () => {
      this.ensure(); const requests = this.requests(pending.plan), failures: string[] = [];
      let completed = false;
      try { const log = this.codec.decode(await this.files.read(this.layout.operationPath(pending.plan.finalId))).attributes; completed = Array.isArray(log.buzhou) && log.buzhou.length > 0 && log.buzhou.every((step: unknown) => typeof step === "object" && step !== null && (step as { jieguo?: string }).jieguo === "yiwancheng"); } catch { /* Missing or damaged receipt cannot authorize replay. */ }
      if (completed) { await this.operations.run(requests.final); if (this.active()) { await this.index.rebuild(); report(pending.plan.project.path, "项目操作已完成"); } return; }
      await this.index.rebuild(); this.ensure();
      const project = this.index.find(requests.projectId);
      if (!project || project.path !== pending.plan.project.path || project.version.original !== pending.plan.project.original) throw new Error("原项目已变化，暂停整个流程，请核对后重新选择");
      for (const item of requests.tasks) {
        this.ensure();
        if (!item.request) { report(item.path, "保留"); continue; }
        try { await this.operations.run(item.request); report(item.path, "已处理"); } catch (error) { const text = error instanceof Error ? error.message : String(error); failures.push(`${item.path}：${text}`); report(item.path, `失败：${text}`); }
      }
      await this.index.rebuild(); this.ensure();
      if (failures.length) throw new Error(`项目未关闭；已成功的待办保留。可恢复同一流程：\n${failures.join("\n")}`);
      let alreadyDone = false;
      try { const log = this.codec.decode(await this.files.read(this.layout.operationPath(pending.plan.finalId))).attributes; alreadyDone = Array.isArray(log.buzhou) && log.buzhou.length > 0 && log.buzhou.every((step: unknown) => typeof step === "object" && step !== null && (step as { jieguo?: string }).jieguo === "yiwancheng"); } catch { /* No receipt: check current tasks before completing. */ }
      if (pending.plan.action === "wancheng" && !alreadyDone && (this.index.issues().length || this.tasks(requests.projectId).some((row) => !requests.kept.has(String(row.attributes.biaoshi).toLowerCase())))) throw new Error("出现新待办或未处理记录，项目未关闭；请核对后创建新的关闭流程");
      this.ensure(); await this.operations.run(requests.final); if (this.active()) { await this.index.rebuild(); report(pending.plan.project.path, "项目操作已完成"); }
    })(); pending.running = work; void work.finally(() => { delete pending.running; }).catch(() => undefined); return work;
  }
}
