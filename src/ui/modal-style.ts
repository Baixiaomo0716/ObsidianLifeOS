import { setIcon, type Modal } from "obsidian";

/** Obsidian mounts dialogs outside the workspace, so give them their own scope. */
export function styleLifeOSModal(modal: Modal, variant: string): void {
  modal.modalEl.classList.add("lifeos-modal", `lifeos-modal-${variant}`);
  modal.contentEl.classList.add("lifeos-modal-content");
}

export function modalHeader(modal: Modal, title: string, subtitle: string, icon: string): void {
  const header = modal.contentEl.createDiv({ cls: "lifeos-modal-header" });
  setIcon(header.createSpan({ cls: "lifeos-modal-heading-icon" }), icon);
  const text = header.createDiv();
  text.createEl("h2", { text: title });
  text.createEl("p", { text: subtitle });
}
