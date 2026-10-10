import type { Snapshot } from "../ports/entity-store";
import type { Action } from "../ports/operation";
import type { Clock } from "../ports/clock";
import { EntityIndex } from "./entity-index";
import { StoreError } from "../domain/errors";
import { cloneData } from "../storage/data-values";

export class TrashStore {
  constructor(private readonly index: EntityIndex, private readonly clock: Clock) {}
  async list(): Promise<Snapshot[]> {
    await this.index.rebuild();
    return this.index.snapshots().filter((entry) => entry.attributes.yihuishou === true);
  }
  async prepare(snapshot: Snapshot, recycle: boolean): Promise<Extract<Action, { caozuoleixing: "gengxin" }>> {
    const captured = cloneData(snapshot);
    await this.index.rebuild();
    const current = this.index.snapshots().find((entry) => entry.path === captured.path);
    if (!current || current.version.original !== captured.version.original) throw new StoreError("conflict", "记录已变化，请重新加载");
    if (!current.validation.ok) throw new StoreError("validation", "非法记录需先修复，不能回收或恢复");
    const problems = this.index.issues();
    if (problems.some((issue) => issue.path === current.path && issue.code === "duplicate_id")) throw new StoreError("duplicate_id", "标识重复，不能回收或恢复");
    if (recycle && current.attributes.shiti === "xiangmu") {
      // Refuse even unreadable files: their inbound references cannot be disproved.
      if (problems.some((issue) => issue.code !== "duplicate_diary")) throw new StoreError("validation", "存在未解决数据问题，无法确认项目引用");
      const id = String(current.attributes.biaoshi).toLowerCase();
      if (this.index.snapshots().some((entry) => entry.path !== current.path && Array.isArray(entry.attributes.guanlian)
        && entry.attributes.guanlian.some((target) => typeof target === "string" && target.toLowerCase() === id)))
        throw new StoreError("validation", "项目仍被记录引用，请先解除关联；回收记录的引用也需处理");
    }
    return { caozuoleixing: "gengxin", banben: captured.version,
      xiugai: recycle ? current.attributes.yihuishou === true ? {} : { set: { yihuishou: true, huishoushijian: this.clock.now() } }
        : current.attributes.yihuishou !== true ? {} : { set: { yihuishou: false }, unset: ["huishoushijian"] } };
  }
}
