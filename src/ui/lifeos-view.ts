import { ItemView, type WorkspaceLeaf } from "obsidian";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App, type AppProps } from "./App";

export const LIFEOS_VIEW_TYPE = "lifeos-workspace";

export class LifeOSView extends ItemView {
  private root: Root | null = null;
  private mount: HTMLElement | null = null;
  private disposed = false;

  constructor(leaf: WorkspaceLeaf, private readonly isEnabled: () => boolean, private readonly context: AppProps = {}) {
    super(leaf);
  }

  override getViewType(): string { return LIFEOS_VIEW_TYPE; }
  override getDisplayText(): string { return "LifeOS"; }
  override getIcon(): string { return "layout-dashboard"; }

  override async onOpen(): Promise<void> {
    if (this.disposed || !this.isEnabled() || this.root) return;
    // Use this pane's document so pop-out windows do not write into the main document.
    this.mount = this.contentEl.ownerDocument.createElement("div");
    this.mount.className = "lifeos-root";
    this.contentEl.classList.add("lifeos-view-content");
    this.contentEl.replaceChildren(this.mount);
    try {
      this.root = createRoot(this.mount);
      this.root.render(createElement<AppProps>(App, this.context));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.root?.unmount();
    } finally {
      this.root = null;
      this.mount?.remove();
      this.mount = null;
      this.contentEl.classList.remove("lifeos-view-content");
    }
  }

  override async onClose(): Promise<void> { this.dispose(); }
}
