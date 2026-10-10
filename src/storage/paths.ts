import { type Shiti, shiti } from "../domain/entities";
import { uuidV4 } from "../domain/validation";
import { StoreError } from "../domain/errors";
export const moduleFolders: Readonly<Record<Shiti, string>> = {
  riji: "10_日记", jizhang: "20_记账", yuedu: "30_阅读", yingshi: "40_影视", youxi: "45_游戏",
  yanchu: "50_演出", lvxing: "60_旅行", zhishi: "80_知识", daiban: "81_待办", xiangmu: "82_项目",
};
export function safePath(path: string): string {
  if (typeof path !== "string" || !path || /[\\<>:"|?*\u0000-\u001f]/.test(path) || path.startsWith("/")) throw new StoreError("path", "路径须为正斜杠分隔的Vault相对路径", path);
  if (path.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part) || part.startsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new StoreError("path", "路径包含穿越、隐藏目录或跨平台不安全名称", path);
  return path;
}
export class StorageLayout {
  readonly root: string;
  readonly folders: Readonly<Record<Shiti, string>>;
  constructor(root = "LifeOS", folders: Readonly<Record<Shiti, string>> = moduleFolders) {
    this.root = safePath(root);
    this.folders = Object.freeze({ ...folders });
    const values = shiti.map((type) => safePath(this.folders[type]).toLowerCase());
    for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
      const a = values[i]!, b = values[j]!;
      if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) throw new StoreError("path", "模块目录不能重叠");
    }
    if (values.some((value) => ["00_系统", "90_附件", "99_回收与冲突"].some((reserved) => value === reserved || value.startsWith(`${reserved}/`)))) throw new StoreError("path", "业务目录不能位于系统、附件或回收目录");
  }
  module(type: Shiti): string { return `${this.root}/${this.folders[type]}`; }
  operationPath(id: string): string {
    if (!uuidV4.test(id)) throw new StoreError("validation", "操作标识需要UUID v4");
    return `${this.root}/00_系统/operations/${id.toLowerCase()}.json`;
  }
  conflictPath(id: string, type: Shiti): string {
    if (!uuidV4.test(id)) throw new StoreError("validation", "副本标识需要UUID v4");
    return `${this.root}/99_回收与冲突/chongtu/${id.toLowerCase()}.${type === "jizhang" ? "json" : "md"}`;
  }
  ledgerPath(id: string): string {
    if (!uuidV4.test(id)) throw new StoreError("validation", "记账文件名需要UUID v4");
    return `${this.module("jizhang")}/shuju/${id.toLowerCase()}.json`;
  }
  typeFor(path: string): Shiti {
    safePath(path);
    for (const type of shiti) {
      const prefix = `${this.module(type)}/`;
      if (!path.startsWith(prefix)) continue;
      const relative = path.slice(prefix.length);
      if (type === "jizhang") {
        if (!/^shuju\/[0-9a-f-]+\.json$/.test(relative) || !uuidV4.test(relative.slice(6, -5))) throw new StoreError("path", "记账只能保存为shuju下的UUID.json", path);
      } else if (!relative.endsWith(".md")) throw new StoreError("path", "笔记只能使用.md文件", path);
      return type;
    }
    throw new StoreError("path", "文件不在LifeOS业务模块目录内", path);
  }
  isManaged(path: string): boolean { try { this.typeFor(path); return true; } catch { return false; } }
  assertRecord(path: string, record: Readonly<Record<string, unknown>>): Shiti {
    const type = this.typeFor(path);
    if (record.shiti !== type) throw new StoreError("validation", "实体与模块目录不一致", path);
    if (type === "jizhang" && (typeof record.biaoshi !== "string" || path !== this.ledgerPath(record.biaoshi))) throw new StoreError("validation", "记账标识与文件名不一致", path);
    return type;
  }
}
