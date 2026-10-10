import type { FileSystem } from "../ports/file-system";
import { EntityIndex, type IndexIssue } from "./entity-index";
import { validateRecord } from "../domain/validation";
import type { Jilu } from "../domain/entities";

export class IntegrityCheck {
  constructor(private readonly index: EntityIndex, private readonly files: FileSystem) {}
  async run(): Promise<IndexIssue[]> {
    await this.index.rebuild();
    const issues = this.index.issues(), records = this.index.all();
    const targets = new Map(records.map((entry) => [String(entry.attributes.biaoshi).toLowerCase(), entry.attributes as Jilu]));
    const files = new Set(await this.files.list());
    for (const entry of records) {
      const data = entry.attributes;
      if (Array.isArray(data.guanlian)) {
        for (const id of data.guanlian) if (typeof id === "string" && !targets.has(id.toLowerCase()))
          issues.push({ path: entry.path, code: "missing_reference", message: `关联目标不存在、已回收或存在争议：${id}` });
        const result = validateRecord(data, { targets, previous: data.guanlian as string[] });
        if (!result.ok) for (const error of result.errors) issues.push({ path: entry.path, code: "relation_validation", message: `${error.field}: ${error.message}` });
      }
      if (Array.isArray(data.shangchuanwenjian)) for (const path of data.shangchuanwenjian) if (typeof path === "string" && !files.has(path))
        issues.push({ path: entry.path, code: "missing_attachment", message: `附件尚未找到：${path}` });
    }
    return issues;
  }
}
