import { TFile, TFolder, type Vault } from "obsidian";
import { StoreError } from "../../domain/errors";
import type { FileSystem } from "../../ports/file-system";
import { safePath } from "../../storage/paths";
export class ObsidianFileSystem implements FileSystem {
  constructor(private readonly vault: Vault, private readonly isActive: () => boolean = () => true) {}
  private active(): void { if (!this.isActive()) throw new StoreError("inactive", "插件已卸载，不能继续启动文件操作"); }
  private file(path: string): TFile {
    this.active();
    safePath(path);
    const entry = this.vault.getAbstractFileByPath(path);
    if (!entry) throw new StoreError("not_found", "文件不存在", path);
    if (!(entry instanceof TFile) || entry.path !== path) throw new StoreError("path", "路径不是匹配的真实文件", path);
    return entry;
  }
  async list(): Promise<readonly string[]> { this.active(); return this.vault.getFiles().map((file) => file.path); }
  async read(path: string): Promise<string> {
    const file = this.file(path);
    try { return await this.vault.read(file); }
    catch (error) { throw new StoreError("io", "读取文件失败", path, error); }
  }
  async create(path: string, text: string): Promise<void> {
    this.active();
    safePath(path);
    if (this.vault.getAbstractFileByPath(path)) throw new StoreError("already_exists", "目标已存在，禁止覆盖", path);
    const parts = path.split("/");
    parts.pop();
    let parent = "";
    for (const part of parts) {
      this.active();
      parent = parent ? `${parent}/${part}` : part;
      let entry = this.vault.getAbstractFileByPath(parent);
      if (!entry) {
        try { await this.vault.createFolder(parent); }
        catch (error) {
          entry = this.vault.getAbstractFileByPath(parent);
          if (!(entry instanceof TFolder)) throw new StoreError("io", "创建目录失败", parent, error);
        }
        entry = this.vault.getAbstractFileByPath(parent);
      }
      if (!(entry instanceof TFolder) || entry.path !== parent) throw new StoreError("path", "父目录与文件或别名冲突", parent);
    }
    this.active();
    if (this.vault.getAbstractFileByPath(path)) throw new StoreError("already_exists", "目标已存在，禁止覆盖", path);
    try { await this.vault.create(path, text); }
    catch (error) {
      throw new StoreError(this.vault.getAbstractFileByPath(path) ? "already_exists" : "io", "新建失败，请核对目标文件后重试", path, error);
    }
  }
  async process(path: string, transform: (current: string) => string): Promise<string> {
    const file = this.file(path);
    try {
      return await this.vault.process(file, (current) => { this.active(); return transform(current); });
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError("io", "受保护文件更新失败", path, error);
    }
  }
}
