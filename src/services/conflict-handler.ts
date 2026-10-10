import { StoreError } from "../domain/errors";
import type { ContentVersion, Edit } from "../ports/entity-store";
import type { FileSystem } from "../ports/file-system";
import type { Action, Receipt } from "../ports/operation";
import { cloneData } from "../storage/data-values";
import { StorageLayout } from "../storage/paths";
import { OperationService } from "./operation-service";
export class ConflictHandler {
  constructor(private readonly fs: FileSystem, private readonly layout: StorageLayout, private readonly operations: OperationService) {}
  async capture(version: ContentVersion, edit: Edit): Promise<Extract<Action, { caozuoleixing: "fuben" }>> {
    this.layout.typeFor(version.path);
    const request = cloneData({ banben: version, xiugai: edit });
    const current = await this.fs.read(request.banben.path);
    if (current === request.banben.original) throw new StoreError("validation", "原文未变化，请正常保存");
    return { caozuoleixing: "fuben", ...request, dangqianyuanwen: current };
  }
  saveCopy(operationId: string, request: Extract<Action, { caozuoleixing: "fuben" }>): Promise<Receipt> {
    return this.operations.run({ caozuobiaoshi: operationId, buzhou: [request] });
  }
}
