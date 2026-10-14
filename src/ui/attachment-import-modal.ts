import { Modal, Notice, type App } from "obsidian";
import type { AttachmentSource } from "../ports/attachment";
import { AttachmentStore, type AttachmentDraft } from "../storage/attachment-store";
import { AttachmentReferenceService, type AttachmentReferenceDraft } from "../services/attachment-reference-service";
import { EntityIndex } from "../services/entity-index";
interface Item { file: AttachmentSource; button: HTMLButtonElement; message: HTMLElement; draft?: AttachmentDraft; reference?: AttachmentReferenceDraft; imported: boolean; done: boolean; running: boolean }
export function openAttachmentImportModal(app: App, projectId: string, index: EntityIndex, store: AttachmentStore, references: AttachmentReferenceService, maxBytes: number, active: () => boolean, onClosed: () => void): () => void {
  const modal = new Modal(app), content = modal.contentEl;
  let closed = false, queue = Promise.resolve();
  const items: Item[] = [];
  modal.onClose = () => { if (!closed) { closed = true; onClosed(); } };
  content.createEl("h2", { text: "导入项目附件" });
  content.createEl("p", { text: `每个文件最大${(maxBytes / 1024 / 1024).toFixed(1)} MiB。复制并核对后才关联；失败文件可单独重试。同步状态请在同步工具中查看。` });
  const label = content.createEl("label", { text: "选择多个文件 " }), input = label.createEl("input", { type: "file" }); input.multiple = true;
  const list = content.createDiv({ cls: "lifeos-attachment-import-list" });
  const run = (item: Item): Promise<void> => {
    if (item.running || item.done || !active() || closed) return Promise.resolve();
    item.running = true; item.button.disabled = true; item.message.textContent = "等待导入…";
    const work = queue.then(async () => {
      if (!active() || closed) { item.message.textContent = "尚未开始，可重新打开后导入"; return; }
      item.message.textContent = "正在复制并核对…";
      if (!item.draft) {
        await index.rebuild();
        const project = index.find(projectId);
        if (!project) throw new Error("项目不存在、已回收或存在争议");
        const parent = project.path.slice(0, project.path.lastIndexOf("/"));
        const folder = parent.endsWith("/" + project.path.split("/").pop()!.replace(/\.md$/i, ""))
          ? parent : `${parent}/${project.path.split("/").pop()!.replace(/\.md$/i, "")}`;
        item.draft = await store.prepare(item.file, projectId, undefined, folder);
      }
      if (!item.imported) { await store.execute(item.draft); item.imported = true; }
      if (!item.reference) {
        await index.rebuild(); const project = index.find(projectId);
        if (!project) throw new Error("项目不存在、已回收或存在争议；附件保留，未关联");
        item.reference = await references.prepare(project, [...project.attributes.shangchuanwenjian as string[], item.draft.info.路径]);
      }
      await references.execute(item.reference); item.done = true;
      if (!closed && active()) { item.message.textContent = `已导入并关联：${item.draft.info.路径}`; item.button.textContent = "已完成"; }
      else if (active()) new Notice(`附件已导入并关联：${item.file.name}`);
    }).catch((error: unknown) => {
      const message = `${item.imported ? "文件已保存，关联未确认。" : "导入未确认。"}${error instanceof Error ? error.message : String(error)}`;
      if (!closed && active()) { item.message.textContent = message; item.button.textContent = "重试此文件"; }
      else if (active()) new Notice(`${item.file.name}：${message}`);
    }).finally(() => { item.running = false; if (!closed && active()) item.button.disabled = item.done; });
    queue = work; return work;
  };
  input.addEventListener("change", () => {
    if (!active() || closed) return;
    for (const file of Array.from(input.files ?? [])) {
      const row = list.createDiv({ cls: "lifeos-attachment-import-row" }); row.createEl("strong", { text: `${file.name}（${file.size}字节）` });
      const message = row.createEl("p", { text: "待导入", attr: { role: "status" } }), button = row.createEl("button", { text: "导入此文件" });
      const item: Item = { file, message, button, imported: false, done: false, running: false }; items.push(item); button.addEventListener("click", () => { void run(item); });
    }
    input.value = "";
  });
  const actions = content.createDiv({ cls: "lifeos-template-actions" });
  const all = actions.createEl("button", { text: "导入全部待处理文件", cls: "mod-cta" }); all.addEventListener("click", () => { for (const item of items) if (!item.done) void run(item); });
  actions.createEl("button", { text: "关闭" }).addEventListener("click", () => modal.close());
  modal.open(); return () => modal.close();
}
