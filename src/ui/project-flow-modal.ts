import { Modal, Notice, type App } from "obsidian";
import type { Snapshot } from "../ports/entity-store";
import type { ProjectLifecycleService, ProjectFlow, ProjectAction, TaskDisposition } from "../services/project-lifecycle-service";
const labels = { wancheng: "完成项目", chongkai: "重开项目", quxiao: "取消项目", guidang: "归档项目" };
export function openProjectFlow(app: App, service: ProjectLifecycleService, source: Snapshot, active: () => boolean, onClosed: () => void, initial: ProjectAction = "wancheng"): () => void {
  const modal = new Modal(app); let closed = false, busy = false, draft: ProjectFlow | null = null;
  modal.onClose = () => { if (!closed) { closed = true; onClosed(); } };
  modal.contentEl.createEl("h2", { text: "项目关闭与管理" });
  modal.contentEl.createEl("p", { text: "完成项目需为每条未完成待办明确选择；取消/归档只改项目。重开恢复进行中并清除完成、取消和归档标记。已成功的待办操作不回滚。" });
  const select = modal.contentEl.createEl("select"); for (const [value, text] of Object.entries(labels)) select.createEl("option", { value, text }); select.value = initial;
  const list = modal.contentEl.createDiv({ cls: "lifeos-relation-results" }), choices: { id: string; select: HTMLSelectElement }[] = [];
  for (const row of service.pendingTasks(String(source.attributes.biaoshi))) {
    const label = list.createEl("label", { text: row.path.split("/").pop()! }), input = label.createEl("select");
    for (const [value, text] of [["", "请选择处理方式"], ["baoliu", "保留待办"], ["quxiao", "取消待办"], ["yichu", "移出项目"]] as const) input.createEl("option", { value, text });
    choices.push({ id: String(row.attributes.biaoshi), select: input });
  }
  select.addEventListener("change", () => { for (const choice of choices) choice.select.disabled = select.value !== "wancheng"; });
  for (const choice of choices) choice.select.disabled = initial !== "wancheng";
  const status = modal.contentEl.createEl("pre", { cls: "lifeos-relation-results", attr: { role: "status" } }), button = modal.contentEl.createEl("button", { text: "执行项目操作", cls: "mod-cta" });
  button.addEventListener("click", () => {
    if (busy || closed || !active()) return; busy = true; button.disabled = true; select.disabled = true; for (const choice of choices) choice.select.disabled = true;
    void (async () => {
      draft ??= await service.prepare(source, select.value as ProjectAction, Object.fromEntries(choices.map((choice) => [choice.id, choice.select.value as TaskDisposition])));
      if (!closed) status.textContent = `流程：${draft.id}\n`;
      await service.execute(draft, (path, text) => { if (!closed && active()) status.textContent += `${path}：${text}\n`; });
      if (active()) { new Notice("项目操作已完成"); if (!closed) modal.close(); }
    })().catch((error: unknown) => {
      if (!active()) return; const text = error instanceof Error ? error.message : String(error);
      if (closed) new Notice(`项目操作未确认：${text}`); else { status.textContent += `\n${text}`; button.textContent = draft ? "恢复同一流程" : "执行项目操作"; if (!draft) { select.disabled = false; for (const choice of choices) choice.select.disabled = select.value !== "wancheng"; } }
    }).finally(() => { busy = false; if (!closed && active()) button.disabled = false; });
  }); modal.open(); return () => modal.close();
}
export async function openProjectRecovery(app: App, service: ProjectLifecycleService, active: () => boolean, onClosed: () => void): Promise<() => void> {
  const plans = await service.plans(); if (!active()) return () => {};
  const modal = new Modal(app); let closed = false;
  modal.onClose = () => { if (!closed) { closed = true; onClosed(); } };
  modal.contentEl.createEl("h2", { text: "恢复项目流程" }); modal.contentEl.createEl("p", { text: "包含已完成的历史流程；按原回执恢复，已完成步骤不重写。无法处理的版本冲突需核对原文件。" });
  const list = modal.contentEl.createDiv({ cls: "lifeos-relation-results" });
  for (const id of plans) {
    let draft: ProjectFlow | null = null, description = `流程 ${id}`;
    try { draft = await service.restore(id); const info = service.describe(draft); description = `${info.path.split("/").pop()} · ${labels[info.action]} · ${info.time}`; } catch { description += " · 需核对"; }
    if (!active()) return () => {};
    const row = list.createDiv(), button = row.createEl("button", { text: `恢复 ${description}` }), status = row.createEl("pre", { attr: { role: "status" } }); let busy = false;
    button.addEventListener("click", () => {
      if (busy || closed || !active()) return; busy = true; button.disabled = true;
      void (async () => { draft ??= await service.restore(id); await service.execute(draft, (path, text) => { if (!closed && active()) status.textContent += `${path}：${text}\n`; }); if (active()) { if (!closed) status.textContent += "流程完成\n"; else new Notice("项目恢复已完成"); } })()
        .catch((error: unknown) => { if (active()) { if (!closed) status.textContent += String(error); else new Notice(String(error)); } })
        .finally(() => { busy = false; if (!closed && active()) button.disabled = false; });
    });
  }
  if (!plans.length) list.createEl("p", { text: "暂无保存的项目流程。" }); modal.open(); return () => modal.close();
}
