import { Modal, Notice, type App } from "obsidian";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { LedgerForm } from "./LedgerForm";
import type { LedgerService } from "../services/ledger-service";
export function openLedgerModal(app: App, service: LedgerService, active: () => boolean, onClosed: () => void): () => void {
  const modal = new Modal(app), root = createRoot(modal.contentEl); let closed = false;
  modal.onClose = () => { if (!closed) { closed = true; root.unmount(); onClosed(); } };
  root.render(createElement(LedgerForm, { service, active: () => !closed && active(), close: () => modal.close(), saved: () => { if (active()) { new Notice("记账已保存"); if (!closed) modal.close(); } }, failed: (message: string) => { if (active()) new Notice(`记账未确认完成：${message}`); } }));
  modal.open(); return () => modal.close();
}
