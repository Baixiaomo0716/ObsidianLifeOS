import { Modal, Notice, type App } from "obsidian";
import type { Snapshot } from "../ports/entity-store";
import { taskActions, type TaskAction, type TaskDraft, type TaskService } from "../services/task-service";
const labels: Record<TaskAction, string> = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成", chexiaowancheng: "撤销完成", quxiao: "取消待办", huifuquxiao: "恢复取消" };
export function openTaskModal(app: App, service: TaskService, source: Snapshot, active: () => boolean, onClosed: () => void): () => void {
  const modal = new Modal(app); let closed = false, busy = false, draft: TaskDraft | null = null;
  modal.onClose = () => { if (!closed) { closed = true; onClosed(); } };
  modal.contentEl.createEl("h2", { text: "待办进度" });
  modal.contentEl.createEl("p", { text: `当前：${labels[source.attributes.jindu as TaskAction]}${source.attributes.yiquxiao ? " · 已取消" : ""}。取消与恢复不会改变原进度；正文勾选框不控制进度。` });
  const label = modal.contentEl.createEl("label", { text: "操作" }), select = label.createEl("select");
  for (const action of taskActions) select.createEl("option", { value: action, text: labels[action] });
  select.value = String(source.attributes.jindu);
  const message = modal.contentEl.createEl("p", { attr: { role: "status", "aria-live": "polite" } });
  const button = modal.contentEl.createEl("button", { text: "保存", cls: "mod-cta" });
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
      else { message.textContent = text; button.textContent = draft ? "重试同一操作" : "保存"; select.disabled = draft !== null; }
    }).finally(() => { busy = false; if (!closed && active()) button.disabled = false; });
  });
  modal.open(); return () => modal.close();
}
