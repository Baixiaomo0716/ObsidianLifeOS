import { Modal, Notice, type App } from "obsidian";
import type { Snapshot } from "../ports/entity-store";
import { taskActions, type TaskAction, type TaskDraft, type TaskService } from "../services/task-service";
import { modalHeader, styleLifeOSModal } from "./modal-style";
const labels: Record<TaskAction, string> = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成", chexiaowancheng: "撤销完成", quxiao: "取消待办", huifuquxiao: "恢复取消" };
export function openTaskModal(app: App, service: TaskService, source: Snapshot, active: () => boolean, onClosed: () => void): () => void {
  const modal = new Modal(app); let closed = false, busy = false, draft: TaskDraft | null = null;
  modal.onClose = () => { if (!closed) { closed = true; onClosed(); } };
  styleLifeOSModal(modal, "task");
  modalHeader(modal, "待办进度", "让每一件小事，向前一步", "square-check");
  const context = modal.contentEl.createDiv({ cls: "lifeos-modal-task-context" });
  context.createEl("strong", { text: source.path?.split("/").pop()?.replace(/\.md$/i, "") ?? "当前待办" });
  context.createSpan({ text: `当前进度 · ${labels[source.attributes.jindu as TaskAction]}${source.attributes.yiquxiao ? " · 已取消" : ""}`, cls: "lifeos-modal-progress" });
  const label = modal.contentEl.createEl("label", { text: "操作", cls: "lifeos-modal-field lifeos-modal-inline-field" }), select = label.createEl("select");
  for (const action of taskActions) select.createEl("option", { value: action, text: labels[action] });
  select.value = String(source.attributes.jindu);
  modal.contentEl.createEl("p", { text: "取消与恢复不会改变原进度；正文勾选框不控制进度。", cls: "lifeos-modal-hint" });
  const message = modal.contentEl.createEl("p", { cls: "lifeos-modal-status", attr: { role: "status", "aria-live": "polite" } });
  const actions = modal.contentEl.createDiv({ cls: "lifeos-template-actions" });
  actions.createEl("button", { text: "取消" }).addEventListener("click", () => modal.close());
  const button = actions.createEl("button", { text: "保存进度", cls: "mod-cta" });
  button.addEventListener("click", () => {
    if (busy || closed || !active()) return;
    busy = true; button.disabled = true; select.disabled = true;
    void (async () => {
      draft ??= await service.prepare(source, select.value as TaskAction);
      await service.execute(draft);
      if (active()) { new Notice("待办操作已保存"); if (!closed) modal.close(); }
    })().catch((error: unknown) => {
      if (!active()) return;
      const text = error instanceof Error ? error.message : String(error);
      if (closed) new Notice(`待办操作未确认：${text}`);
      else { message.textContent = text; button.textContent = draft ? "重试同一操作" : "保存进度"; select.disabled = draft !== null; }
    }).finally(() => { busy = false; if (!closed && active()) button.disabled = false; });
  });
  modal.open(); return () => modal.close();
}
