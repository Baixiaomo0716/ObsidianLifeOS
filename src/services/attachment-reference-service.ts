import type { Snapshot } from "../ports/entity-store";
import type { OperationRequest } from "../ports/operation";
import type { IdGenerator } from "../ports/id-generator";
import { AttachmentStore } from "../storage/attachment-store";
import { safePath } from "../storage/paths";
import { EntityIndex } from "./entity-index";
import { OperationService } from "./operation-service";
export interface AttachmentReferenceDraft { readonly paths: readonly string[] }
interface Pending { request: OperationRequest; paths: string[]; previous: string[]; sourcePath: string; started: boolean; running?: Promise<void> }
export class AttachmentReferenceService {
  private readonly drafts = new WeakMap<AttachmentReferenceDraft, Pending>();
  constructor(private readonly index: EntityIndex, private readonly attachments: AttachmentStore, private readonly operations: Pick<OperationService, "run">, private readonly ids: IdGenerator, private readonly active: () => boolean) {}
  private async additions(paths: readonly string[], previous: readonly string[]): Promise<void> {
    for (const path of paths) { safePath(path); if (!previous.includes(path)) await this.attachments.verifyPath(path); }
    if (!this.active()) throw new Error("附件引用操作已停止");
  }
  async prepare(source: Snapshot, selected: readonly string[]): Promise<AttachmentReferenceDraft> {
    if (!this.active() || !Array.isArray(selected) || selected.some((path) => typeof path !== "string")) throw new Error("附件引用请求无效");
    const paths = [...new Set(selected)];
    await this.index.rebuild(); const current = this.index.find(String(source.attributes.biaoshi));
    if (!current || current.attributes.shiti !== "xiangmu" || current.path !== source.path || current.version.original !== source.version.original) throw new Error("项目已变化或不可用，请重新读取项目，不会覆盖原文");
    const previous = current.attributes.shangchuanwenjian as string[];
    await this.additions(paths, previous);
    const draft = Object.freeze({ paths: Object.freeze([...paths]) });
    this.drafts.set(draft, { paths, previous: [...previous], sourcePath: current.path, started: false, request: { caozuobiaoshi: this.ids.next(), buzhou: [{ caozuoleixing: "gengxin", banben: current.version, xiugai: { set: { shangchuanwenjian: paths } } }] } });
    return draft;
  }
  execute(draft: AttachmentReferenceDraft): Promise<void> {
    const pending = this.drafts.get(draft);
    if (!pending) return Promise.reject(new Error("附件引用保存请求无效"));
    if (pending.running) return pending.running;
    const work = (async () => {
      if (!this.active()) throw new Error("附件引用操作已停止");
      if (!pending.started) { await this.additions(pending.paths, pending.previous); pending.started = true; }
      await this.operations.run(pending.request);
      if (this.active()) await this.index.changed(pending.sourcePath);
    })();
    pending.running = work; void work.finally(() => { delete pending.running; }).catch(() => undefined); return work;
  }
}
