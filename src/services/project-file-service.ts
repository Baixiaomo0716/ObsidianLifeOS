import type { Snapshot } from "../ports/entity-store";
import type { AttachmentInfo, AttachmentStore } from "../storage/attachment-store";
import type { EntityIndex } from "./entity-index";
import type { AttachmentReferenceDraft, AttachmentReferenceService } from "./attachment-reference-service";
export interface ProjectFileRow { path: string; info?: AttachmentInfo; error?: string }
export class ProjectFileService {
  constructor(private readonly index: EntityIndex, private readonly store: AttachmentStore, private readonly references: AttachmentReferenceService, private readonly active: () => boolean) {}
  private async current(source: Snapshot): Promise<Snapshot> {
    if (!this.active()) throw new Error("附件操作已停止");
    await this.index.rebuild(); const current = this.index.find(String(source.attributes.biaoshi));
    if (!this.active() || !current || current.attributes.shiti !== "xiangmu" || current.path !== source.path || current.version.original !== source.version.original) throw new Error("项目已变化，请重新读取项目");
    return current;
  }
  async list(source: Snapshot): Promise<ProjectFileRow[]> {
    const current = await this.current(source);
    return Promise.all((current.attributes.shangchuanwenjian as string[]).map(async (path) => {
      try { return { path, info: await this.store.verifyPath(path) }; }
      catch (error) { return { path, error: error instanceof Error ? error.message : String(error) }; }
    }));
  }
  async open(source: Snapshot, path: string): Promise<string> {
    const current = await this.current(source);
    if (!(current.attributes.shangchuanwenjian as string[]).includes(path)) throw new Error("该文件已移出项目");
    await this.store.verifyPath(path);
    if (!this.active()) throw new Error("附件操作已停止");
    return path;
  }
  async prepareRemove(source: Snapshot, path: string): Promise<AttachmentReferenceDraft> {
    const current = await this.current(source), paths = current.attributes.shangchuanwenjian as string[];
    if (!paths.includes(path)) throw new Error("该文件已移出项目");
    return this.references.prepare(current, paths.filter((entry) => entry !== path));
  }
  executeRemove(draft: AttachmentReferenceDraft): Promise<void> { return this.references.execute(draft); }
}
