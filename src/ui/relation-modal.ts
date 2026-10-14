import { Modal, Notice, type App } from "obsidian";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { RelationPicker, type RelationPickerProps } from "./RelationPicker";
import { styleLifeOSModal } from "./modal-style";
export function openRelationModal(app: App, props: Omit<RelationPickerProps, "close" | "saved">, onClosed: () => void): () => void {
  const modal = new Modal(app), root = createRoot(modal.contentEl), ownerActive = props.active;
  styleLifeOSModal(modal, "relation");
  let closed = false;
  modal.onClose = () => { if (!closed) { closed = true; root.unmount(); onClosed(); } };
  root.render(createElement(RelationPicker, { ...props, active: () => !closed && ownerActive(), failed: (message) => { if (ownerActive()) new Notice(`关联保存未确认完成：${message}`); }, close: () => modal.close(), saved: () => { if (ownerActive()) { new Notice("关联已保存"); if (!closed) modal.close(); } } }));
  modal.open(); return () => modal.close();
}
