import { TFile, TFolder, type Vault } from "obsidian";
import { StoreError } from "../../domain/errors";
import type { BinaryFileSystem } from "../../ports/attachment";
import { safePath } from "../../storage/paths";
export class ObsidianBinaryFileSystem implements BinaryFileSystem {
  constructor(private readonly vault: Vault, private readonly isActive: () => boolean) {}
  private active(): void { if (!this.isActive()) throw new StoreError("inactive", "插件已卸载，附件操作暂停"); }
  async read(path: string): Promise<ArrayBuffer> {
    this.active(); safePath(path);
    const file = this.vault.getAbstractFileByPath(path);
    if (!file) throw new StoreError("not_found", "附件不存在或尚未同步", path);
    if (!(file instanceof TFile) || file.path !== path) throw new StoreError("path", "附件路径与实际文件不一致", path);
    try { const bytes = await this.vault.readBinary(file); this.active(); return bytes; }
    catch (error) { if (error instanceof StoreError) throw error; throw new StoreError("io", "读取附件失败", path, error); }
  }
  async create(path: string, bytes: ArrayBuffer): Promise<void> {
    this.active(); safePath(path);
    if (this.vault.getAbstractFileByPath(path)) throw new StoreError("already_exists", "附件目标已存在，禁止覆盖", path);
    let parent = "";
    for (const part of path.split("/").slice(0, -1)) {
      this.active(); parent = parent ? `${parent}/${part}` : part;
      let entry = this.vault.getAbstractFileByPath(parent);
      if (!entry) {
        try { await this.vault.createFolder(parent); }
        catch (error) { if (!(this.vault.getAbstractFileByPath(parent) instanceof TFolder)) throw new StoreError("io", "附件目录创建失败", parent, error); }
        entry = this.vault.getAbstractFileByPath(parent);
      }
      if (!(entry instanceof TFolder) || entry.path !== parent) throw new StoreError("path", "附件父目录冲突", parent);
    }
    this.active();
    if (this.vault.getAbstractFileByPath(path)) throw new StoreError("already_exists", "附件目标已存在，禁止覆盖", path);
    try { await this.vault.createBinary(path, bytes); this.active(); }
    catch (error) { if (error instanceof StoreError) throw error; throw new StoreError(this.vault.getAbstractFileByPath(path) ? "already_exists" : "io", "附件复制未确认完成，请保留记录重试", path, error); }
  }
}
