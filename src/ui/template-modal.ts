import { Modal, Notice, TFile, type App } from "obsidian";
import { TemplateService, type NoteDraft } from "../services/template-service";
import { noteLabels, type NoteType } from "../services/note-templates";
export function openTemplateModal(app: App, service: TemplateService, type: NoteType, active: () => boolean): void {
  const modal = new Modal(app), content = modal.contentEl;
  let closed = false;
  modal.onClose = () => { closed = true; };
  content.createEl("h2", { text: `新建${noteLabels[type]}` });
  content.createEl("p", { text: "创建后在笔记属性中继续填写。长文本可在源模式编辑；进度列表填写一个状态。" });
  const label = content.createEl("label", { text: type === "riji" ? "日记日期" : "笔记标题" });
  const input = label.createEl("input", { type: type === "riji" ? "date" : "text" });
  input.classList.add("lifeos-template-input");
  if (type === "riji") { try { input.value = service.today(); } catch (error) { new Notice(String(error)); return; } }
  else input.maxLength = 240;
  const message = content.createEl("p", { attr: { role: "status", "aria-live": "polite" } });
  const actions = content.createDiv({ cls: "lifeos-template-actions" });
  const cancel = actions.createEl("button", { text: "取消" }); cancel.addEventListener("click", () => modal.close());
  const button = actions.createEl("button", { text: "创建并打开笔记", cls: "mod-cta" });
  let draft: NoteDraft | null = null, key = "", savedPath: string | null = null;
  button.addEventListener("click", () => {
    if (button.disabled || !active()) return;
    button.disabled = true; input.disabled = true;
    void (async () => {
      if (!savedPath) {
        if (!draft || key !== input.value) { draft = await service.prepare(type, type === "riji" ? "" : input.value, type === "riji" ? input.value : undefined); key = input.value; }
        savedPath = await service.execute(draft);
      }
      if (!active()) return;
      if (closed) { new Notice(`笔记已保存：${savedPath}`); return; }
      const file = app.vault.getAbstractFileByPath(savedPath);
      if (!(file instanceof TFile)) throw new Error(`笔记已保存，请在文件列表打开：${savedPath}`);
      await app.workspace.getLeaf(true).openFile(file);
      modal.close();
    })().catch((error: unknown) => {
      if (!active()) return;
      if (closed) { new Notice(error instanceof Error ? error.message : String(error)); return; }
      message.textContent = `${savedPath ? "笔记已保存，打开失败。" : "未确认创建完成；保持输入重试沿用同操作。"}${error instanceof Error ? error.message : String(error)}`;
      if (savedPath) button.textContent = "打开已保存笔记";
    }).finally(() => { button.disabled = false; input.disabled = savedPath !== null; });
  });
  modal.open(); input.focus();
}
