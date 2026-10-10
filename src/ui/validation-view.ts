import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { Snapshot } from "../ports/entity-store";
import { jinduZiduan, type Jindu } from "../domain/entities";
import { fieldNames } from "../storage/chinese-fields";
export const VALIDATION_VIEW_TYPE = "lifeos-validation";
export class ValidationView extends ItemView {
  private revision = 0;
  private closed = false;
  constructor(leaf: WorkspaceLeaf, private readonly currentPath: () => string | null, private readonly read: (path: string) => Promise<Snapshot>, private readonly active: () => boolean,
    private readonly saveProgress?: (snapshot: Snapshot, next: Jindu) => Promise<void>, private readonly editRelations?: (id: string) => void) { super(leaf); }
  override getViewType(): string { return VALIDATION_VIEW_TYPE; }
  override getDisplayText(): string { return "LifeOS 笔记校验"; }
  override getIcon(): string { return "list-checks"; }
  override async onOpen(): Promise<void> { await this.refresh(); }
  async refresh(): Promise<void> {
    const revision = ++this.revision, path = this.currentPath();
    let lines: string[] = [], heading = "选择一篇 LifeOS 模板笔记", current: Snapshot | null = null;
    if (path) try {
      const snapshot = await this.read(path); heading = snapshot.validation.ok ? "笔记字段有效" : "初稿待完善";
      current = snapshot;
      lines = [...(snapshot.validation.ok ? [] : snapshot.validation.errors.map((issue) => `${fieldNames[issue.field] ?? issue.field}：${issue.message}`)), ...snapshot.validation.warnings.map((issue) => `${fieldNames[issue.field] ?? issue.field}：${issue.message}`)];
    } catch (error) { heading = "笔记校验未完成"; lines = [error instanceof Error ? error.message : String(error)]; }
    if (this.closed || !this.active() || revision !== this.revision) return;
    this.contentEl.replaceChildren();
    this.contentEl.createEl("h3", { text: heading });
    if (path) this.contentEl.createEl("p", { text: path });
    if (current?.validation.ok && ["riji", "daiban"].includes(current.validation.value.shiti) && this.editRelations) {
      const id = current.validation.value.biaoshi, button = this.contentEl.createEl("button", { text: "编辑关联" });
      button.addEventListener("click", () => { if (!this.closed && this.active() && revision === this.revision) this.editRelations?.(id); });
    }
    if (current?.validation.ok && jinduZiduan(current.validation.value.shiti) && this.saveProgress) {
      const snapshot = current, field = jinduZiduan(current.validation.value.shiti)!, label = this.contentEl.createEl("label", { text: "进度 " });
      const select = label.createEl("select");
      for (const [value, text] of [["weikaishi", "未开始"], ["jinxingzhong", "进行中"], ["yiwancheng", "已完成"]] as const) select.createEl("option", { value, text });
      select.value = String(snapshot.attributes[field] ?? "weikaishi");
      const message = this.contentEl.createEl("p", { attr: { role: "status" } });
      select.addEventListener("change", () => {
        if (!this.active() || this.closed || revision !== this.revision) return;
        select.disabled = true;
        void this.saveProgress!(snapshot, select.value as Jindu).then(() => this.refresh()).catch((error: unknown) => {
          if (!this.closed && revision === this.revision) { message.textContent = error instanceof Error ? error.message : String(error); select.value = String(snapshot.attributes[field] ?? "weikaishi"); select.disabled = false; }
        });
      });
    }
    const list = this.contentEl.createDiv({ cls: "lifeos-integrity-list" });
    for (const line of lines) list.createEl("p", { text: line });
    this.contentEl.createEl("p", { text: "在原生属性或源模式中填写。错误不会阻止 Obsidian 自动保存；完善后自动进入索引。系统身份缺失可执行初始化命令。" });
  }
  dispose(): void { this.closed = true; this.revision++; this.contentEl.replaceChildren(); }
  override async onClose(): Promise<void> { this.dispose(); }
}
