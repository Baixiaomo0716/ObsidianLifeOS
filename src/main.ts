import { PeriodReviewService } from "./services/period-review-service";
import { KnowledgeService } from "./services/knowledge-service";
import { TravelService } from "./services/travel-service";
import { PerformanceService } from "./services/performance-service";
import { GameService } from "./services/game-service";
import { FilmService } from "./services/film-service";
import { ReadingService } from "./services/reading-service";
import { JournalLedgerRelationService } from "./services/journal-ledger-relation-service";
import { SummaryService } from "./services/summary-service";
import { ProjectFileService } from "./services/project-file-service";
import { ProjectLifecycleService, type ProjectAction } from "./services/project-lifecycle-service";
import { openProjectFlow, openProjectRecovery } from "./ui/project-flow-modal";
import { ProjectService } from "./services/project-service";
import { LedgerTableService } from "./services/ledger-table-service";
import { LedgerService } from "./services/ledger-service";
import { openLedgerModal } from "./ui/ledger-modal";
import { Modal, Notice, Plugin, TFile } from "obsidian";
import { LifeOSView, LIFEOS_VIEW_TYPE } from "./ui/lifeos-view";
import { LifeOSSettingTab, renderLifeOSSettings } from "./settings/lifeos-setting-tab";
import { ObsidianFileSystem } from "./adapters/obsidian/file-system";
import { LedgerStore, NoteStore } from "./storage/entity-store";
import { StorageLayout, safePath } from "./storage/paths";
import { BrowserDeviceIdentity, BrowserFingerprint, BrowserIds } from "./adapters/browser/identity";
import { OperationService } from "./services/operation-service";
import { ConflictHandler } from "./services/conflict-handler";
import { runHostCheck } from "./services/host-check";
import { EntityIndex } from "./services/entity-index";
import { IntegrityCheck } from "./services/integrity-check";
import { TrashStore } from "./services/trash-store";
import { SettingsStore, type SettingsSnapshot, type Settings, defaultSettings } from "./settings/settings-store";
import { TemplateService } from "./services/template-service";
import { noteLabels, type NoteType } from "./services/note-templates";
import { openTemplateModal } from "./ui/template-modal";
import { TemplateInitializer, type Initialization } from "./services/template-initializer";
import { ValidationView, VALIDATION_VIEW_TYPE } from "./ui/validation-view";
import { changeProgress } from "./domain/progress";
import { jinduZiduan } from "./domain/entities";
import { MarkdownCodec } from "./storage/codecs";
import { propertyTypes } from "./services/note-properties";
import { SearchService } from "./services/search-service";
import { fieldNames } from "./storage/chinese-fields";
import { RelationService } from "./services/relation-service";
import { openRelationModal } from "./ui/relation-modal";
import { AttachmentStore } from "./storage/attachment-store";
import { ObsidianBinaryFileSystem } from "./adapters/obsidian/binary-file-system";
import { BrowserBinaryFingerprint } from "./adapters/browser/binary-fingerprint";
import { AttachmentReferenceService } from "./services/attachment-reference-service";
import { openAttachmentImportModal } from "./ui/attachment-import-modal";
import { JournalRelationService } from "./services/journal-relation-service";
import { JournalContextService } from "./services/journal-context-service";
import { TaskListService } from "./services/task-list-service";
import { TaskService } from "./services/task-service";
import { openTaskModal } from "./ui/task-modal";
import { JournalService } from "./services/journal-service";

export default class LifeOSPlugin extends Plugin {
  stores: { readonly notes: NoteStore; readonly ledger: LedgerStore; readonly layout: StorageLayout; readonly operations: OperationService; readonly conflicts: ConflictHandler } | null = null;
  private enabled = false;
  private generation = 0;
  private opening: Promise<void> | null = null;
  private checking = false;
  private relationModals = new Set<() => void>();
  index: EntityIndex | null = null;
  activeSettings: Settings = defaultSettings();
  settingsSnapshot: SettingsSnapshot | null = null;
  private settingsStore: SettingsStore | null = null;

  async saveSettings(patch: Readonly<Record<string, unknown>>): Promise<void> {
    const generation = this.generation;
    if (!this.enabled || !this.settingsStore || !this.settingsSnapshot) throw new Error("设置尚未可用");
    const saved = await this.settingsStore.save(this.settingsSnapshot, patch);
    if (!this.enabled || generation !== this.generation) return;
    this.settingsSnapshot = saved;
    new Notice("设置已保存。请重新加载 Obsidian 生效；目录变化不会移动已有文件。", 12000);
  }

  override async onload(): Promise<void> {
    this.enabled = true;
    this.generation += 1;
    // Read-only index starts after layout readiness; no automatic business writes.
    const generation = this.generation;
    const files = new ObsidianFileSystem(this.app.vault, () => this.enabled && generation === this.generation);
    const settingsStore = new SettingsStore(files);
    this.settingsStore = settingsStore;
    try {
      const snapshot = await settingsStore.read();
      if (!this.enabled || generation !== this.generation) return;
      this.settingsSnapshot = snapshot;
      this.activeSettings = snapshot.shuju;
    } catch (error) {
      if (!this.enabled || generation !== this.generation) return;
      this.settingsSnapshot = null;
      new Notice(`LifeOS 设置读取失败，业务服务未启动，请保留原配置并修复：${error instanceof Error ? error.message : String(error)}`, 15000);
      this.addSettingTab(new LifeOSSettingTab(this.app, this));
      return;
    }
    const layout = new StorageLayout(this.activeSettings.genmulu, this.activeSettings.mulu);
    const clock = { now: (): string => new Date().toISOString() };
    const notes = new NoteStore(files, layout, clock), ledger = new LedgerStore(files, layout, clock);
    const ids = new BrowserIds();
    const operations = new OperationService(files, layout, notes, ledger, clock, ids, new BrowserDeviceIdentity(ids), new BrowserFingerprint());
    this.stores = { notes, ledger, layout, operations, conflicts: new ConflictHandler(files, layout, operations) };
    const index = new EntityIndex(files, layout);
    this.index = index;
    const templates = new TemplateService(files, layout, index, operations, clock, ids, this.activeSettings.shiqu,
      this.activeSettings.qiyongmokuai.filter((type): type is NoteType => type !== "jizhang"));
    const active = (): boolean => this.enabled && generation === this.generation;
    const tasks = new TaskService(index, templates, operations, clock, ids, active);
    const reading = new ReadingService(index, operations, clock, ids, active);
    const film = new FilmService(index, operations, clock, ids, active);
    const game = new GameService(index, operations, clock, ids, active);
    const performances = new PerformanceService(index, operations, clock, ids, active);
    const travel = new TravelService(index, operations, clock, ids, active);
    const knowledge = new KnowledgeService(index, operations, clock, ids, active);
    const taskList = new TaskListService(index, clock, this.activeSettings.shiqu);
    let openingTask = false;
    const editTask = (id: string): void => {
      if (!active() || openingTask) return;
      openingTask = true;
      void (async () => {
        await index.rebuild(); const source = index.find(id);
        if (!source || source.attributes.shiti !== "daiban") throw new Error("请先完善待办字段，回收或争议记录不能操作");
        if (!active()) return;
        let dispose: () => void;
        dispose = openTaskModal(this.app, tasks, source, active, () => this.relationModals.delete(dispose));
        this.relationModals.add(dispose);
      })().catch((error: unknown) => { if (active()) new Notice(error instanceof Error ? error.message : String(error)); }).finally(() => { openingTask = false; });
    };
    this.addCommand({ id: "edit-task-progress", name: "修改当前待办进度或取消状态", checkCallback: (checking) => {
      const path = this.app.workspace.getActiveFile()?.path;
      if (!active() || !path || layout.typeFor(path) !== "daiban" || !layout.isManaged(path) || !this.activeSettings.qiyongmokuai.includes("daiban")) return false;
      if (!checking) void index.rebuild().then(() => { const source = index.all().find((entry) => entry.path === path); if (source) editTask(String(source.attributes.biaoshi)); else if (active()) new Notice("请先完善待办字段"); }).catch((error: unknown) => { if (active()) new Notice(String(error)); });
      return true;
    } });
    const ledgerEntry = new LedgerService(layout, operations, index, clock, ids, () => this.settingsSnapshot?.shuju ?? this.activeSettings, active);
    const ledgerTable = new LedgerTableService(index, operations, clock, ids, () => this.settingsSnapshot?.shuju ?? this.activeSettings, active);
    const createLedger = (): void => {
      if (!active() || !this.activeSettings.qiyongmokuai.includes("jizhang")) return;
      let dispose: () => void;
      dispose = openLedgerModal(this.app, ledgerEntry, active, () => this.relationModals.delete(dispose));
      this.relationModals.add(dispose);
    };
    this.addCommand({ id: "create-ledger", name: "新建记账", callback: createLedger });
    const journals = new JournalService(index, templates, clock, this.activeSettings.shiqu, active, layout.module("riji"));
    const attachments = new AttachmentStore(files, new ObsidianBinaryFileSystem(this.app.vault, active), layout, clock, ids, new BrowserBinaryFingerprint(), this.activeSettings.fujianzuidadaxiao, active);
    const attachmentReferences = new AttachmentReferenceService(index, attachments, operations, ids, active);
    const projectFiles = new ProjectFileService(index, attachments, attachmentReferences, active);
    const uploadProjectFiles = (id: string): void => {
      if (!active() || !this.activeSettings.qiyongmokuai.includes("xiangmu")) return;
      let dispose: () => void;
      dispose = openAttachmentImportModal(this.app, id, index, attachments, attachmentReferences, this.activeSettings.fujianzuidadaxiao, active, () => this.relationModals.delete(dispose));
      this.relationModals.add(dispose);
    };
    const openProjectFile = async (path: string): Promise<void> => {
      if (!active()) throw new Error("插件已停止");
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) throw new Error("附件不存在，请刷新核验");
      await this.app.workspace.getLeaf(true).openFile(file);
    };
    let openingAttachments = false;
    this.addCommand({ id: "import-project-attachments", name: "导入附件到当前项目", checkCallback: (checking) => {
      const path = this.app.workspace.getActiveFile()?.path;
      if (!active() || !path || !layout.isManaged(path) || layout.typeFor(path) !== "xiangmu" || !this.activeSettings.qiyongmokuai.includes("xiangmu")) return false;
      if (!checking && !openingAttachments) {
        openingAttachments = true;
        void (async () => {
          await index.rebuild(); const project = index.all().find((entry) => entry.path === path);
          if (!project) throw new Error("请先完善项目字段，回收或争议项目不能导入附件");
          if (!active()) return;
          let dispose: () => void;
          dispose = openAttachmentImportModal(this.app, String(project.attributes.biaoshi), index, attachments, attachmentReferences, this.activeSettings.fujianzuidadaxiao, active, () => this.relationModals.delete(dispose));
          this.relationModals.add(dispose);
        })().catch((error: unknown) => { if (active()) new Notice(error instanceof Error ? error.message : String(error)); }).finally(() => { openingAttachments = false; });
      }
      return true;
    } });
    const projectFlows = new ProjectLifecycleService(files, layout, index, operations, clock, ids, new BrowserFingerprint(), () => active() && this.activeSettings.qiyongmokuai.includes("xiangmu"));
    const manageProject = (id: string, action?: ProjectAction): void => {
      if (!active() || !this.activeSettings.qiyongmokuai.includes("xiangmu")) return;
      void (async () => {
        await index.rebuild(); const source = index.find(id);
        if (!source || source.attributes.shiti !== "xiangmu") throw new Error("项目不可用，请核对原文件");
        if (!active()) return; let dispose: () => void;
        dispose = openProjectFlow(this.app, projectFlows, source, active, () => this.relationModals.delete(dispose), action);
        this.relationModals.add(dispose);
      })().catch((error: unknown) => { if (active()) new Notice(String(error)); });
    };
    this.addCommand({ id: "recover-project-flows", name: "恢复项目关闭与管理流程", callback: () => {
      if (!active()) return; let dispose: () => void;
      void openProjectRecovery(this.app, projectFlows, active, () => this.relationModals.delete(dispose)).then((close) => { dispose = close; if (active()) this.relationModals.add(dispose); else dispose(); }).catch((error: unknown) => { if (active()) new Notice(String(error)); });
    } });
    const projects = new ProjectService(index, operations, clock, ids, active);
    const search = new SearchService(index, this.activeSettings.shiqu), relations = new RelationService(index, operations, ids, active);
    const journalCreation = new JournalRelationService(index, templates, relations, active, this.activeSettings.qiyongmokuai.filter((type): type is NoteType => type !== "jizhang"));
    const journalContext = new JournalContextService(index, search, this.activeSettings.shiqu, this.activeSettings.qiyongmokuai);
    let openingRelations = false;
    const editRelations = (id: string): void => {
      if (!active() || openingRelations) return;
      openingRelations = true;
      void (async () => {
        await index.rebuild();
        const source = index.find(id);
        if (!source || !["riji", "daiban"].includes(String(source.attributes.shiti))) throw new Error("请选择有效的日记或待办");
        if (!active()) return;
        let dispose: () => void;
        dispose = openRelationModal(this.app, { source, search, service: relations, allowed: this.activeSettings.qiyongmokuai, active, ...(source.attributes.shiti === "riji" ? { creation: journalCreation, ...(this.activeSettings.qiyongmokuai.includes("jizhang") ? { ledgerCreation: new JournalLedgerRelationService(index, ledgerEntry, relations, active) } : {}) } : {}) }, () => this.relationModals.delete(dispose));
        this.relationModals.add(dispose);
      })().catch((error: unknown) => { if (active()) new Notice(error instanceof Error ? error.message : String(error)); }).finally(() => { openingRelations = false; });
    };
    const initializer = new TemplateInitializer(files, layout, index, clock, ids, new BrowserDeviceIdentity(ids), new BrowserFingerprint());
    const pendingInitializations = new Map<string, Initialization>();
    let validationPath: string | null = null;
    const currentNotePath = (): string | null => {
      const path = this.app.workspace.getActiveFile()?.path;
      if (path && layout.isManaged(path) && layout.typeFor(path) !== "jizhang") validationPath = path;
      return validationPath;
    };
    const refreshing = (): void => { currentNotePath(); for (const leaf of this.app.workspace.getLeavesOfType(VALIDATION_VIEW_TYPE)) if (leaf.view instanceof ValidationView) void leaf.view.refresh(); };
    this.registerView(VALIDATION_VIEW_TYPE, (leaf) => new ValidationView(leaf, currentNotePath, (path) => notes.read(path), active, async (snapshot, next) => {
      if (!active() || !snapshot.validation.ok) throw new Error("笔记尚未可用");
      if (snapshot.attributes.shiti === "xiangmu" && (next === "yiwancheng" || snapshot.attributes.jindu === "yiwancheng")) { manageProject(String(snapshot.attributes.biaoshi), next === "yiwancheng" ? "wancheng" : "chongkai"); return; }
      const changed = changeProgress(snapshot.validation.value, next, clock.now());
      const field = jinduZiduan(changed.shiti);
      if (!field) throw new Error("此笔记不使用进度");
      await operations.run({ caozuobiaoshi: ids.next(), buzhou: [{ caozuoleixing: "gengxin", banben: snapshot.version,
        xiugai: { set: { [field]: next, ...(changed.wanchengshijian ? { wanchengshijian: changed.wanchengshijian } : {}),
          ...(changed.shiti === "yuedu" && changed.duwanshijian ? { duwanshijian: changed.duwanshijian } : {}) },
          ...(!changed.wanchengshijian ? { unset: ["wanchengshijian", ...(changed.shiti === "yuedu" ? ["duwanshijian"] : [])] } : {}) } }] });
      await index.changed(snapshot.path);
    }, editRelations));
    let configuringProperties = false;
    this.addCommand({ id: "configure-note-property-types", name: "配置笔记日期与时间属性类型", callback: () => {
      if (!active() || configuringProperties) return;
      configuringProperties = true;
      void (async () => {
        const path = `${this.app.vault.configDir}/types.json`, adapter = this.app.vault.adapter;
        const before = await adapter.exists(path) ? await adapter.read(path) : "{}";
        const after = propertyTypes(before);
        if (!active()) return;
        if ((await adapter.exists(path) ? await adapter.read(path) : "{}") !== before) throw new Error("属性类型配置已变化，请重试");
        await adapter.write(path, after);
        if (active()) new Notice("日期、日期时间、tags与进度列表类型已配置，请按Ctrl+R重新加载。此类型设置适用于整个笔记库。", 15000);
      })().catch((error: unknown) => { if (active()) new Notice(String(error)); }).finally(() => { configuringProperties = false; });
    } });
    this.addCommand({ id: "simplify-current-note", name: "整理当前笔记的属性与文件名", callback: () => {
      const path = this.app.workspace.getActiveFile()?.path;
      if (!active() || !path || !layout.isManaged(path)) return;
      void (async () => {
        const snapshot = await notes.read(path), type = snapshot.attributes.shiti;
        if (!Object.prototype.hasOwnProperty.call(noteLabels, String(type))) throw new Error("仅整理九类模板笔记");
        if (!snapshot.validation.ok) throw new Error("请先完善字段错误，再整理笔记");
        const attributes: Record<string, unknown> = { ...snapshot.attributes, shuxingmoshi: "tongyi", bijishiqu: snapshot.attributes.bijishiqu ?? this.activeSettings.shiqu,
          biaoqian: snapshot.attributes.biaoqian ?? [],
          ...(["daiban", "xiangmu"].includes(String(type)) ? { kaishiriqi: snapshot.attributes.kaishiriqi ?? null, jiezhiriqi: snapshot.attributes.jiezhiriqi ?? null } : {}) };
        if (type === "zhishi") attributes.jindu ??= "weikaishi";
        const target = safePath(type === "riji" ? `${layout.module("riji")}/${String(attributes.riqi).slice(0, 7)}/${attributes.riqi}.md`
          : `${layout.module(type as NoteType)}/${String(attributes.mingcheng).replace(/[\\/<>:"|?*\u0000-\u001f]/g, "_")}.md`);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error("当前文件已变化");
        if (target !== path && this.app.vault.getAbstractFileByPath(target)) throw new Error("同名笔记已存在，未修改原笔记");
        await files.process(path, (raw) => { if (raw !== snapshot.version.original) throw new Error("笔记已变化，请重试"); return new MarkdownCodec().update(raw, attributes, snapshot.body); });
        if (target !== path && active()) {
          const parts = target.split("/"); parts.pop(); let parent = "";
          for (const part of parts) { parent = parent ? `${parent}/${part}` : part; if (!this.app.vault.getAbstractFileByPath(parent)) await this.app.vault.createFolder(parent); }
          await this.app.fileManager.renameFile(file, target);
        }
        if (active()) { validationPath = target; await index.rebuild(); refreshing(); new Notice("笔记已整理，正文与已有系统信息保留。"); }
      })().catch((error: unknown) => { if (active()) new Notice(`整理未完全完成，请核对当前文件：${String(error)}`, 15000); });
    } });
    this.registerEvent(this.app.workspace.on("active-leaf-change", refreshing));
    this.registerEvent(this.app.vault.on("modify", refreshing));
    let openingValidation: Promise<void> | null = null;
    this.addCommand({ id: "open-note-validation", name: "打开笔记校验侧栏", callback: () => {
      if (openingValidation || !active()) return;
      currentNotePath();
      const existing = this.app.workspace.getLeavesOfType(VALIDATION_VIEW_TYPE)[0];
      const leaf = existing ?? this.app.workspace.getRightLeaf(false);
      if (!leaf) return;
      openingValidation = (async () => {
        try {
          if (!existing) await leaf.setViewState({ type: VALIDATION_VIEW_TYPE, active: true });
          if (!active()) { if (!existing) leaf.detach(); return; }
          if (leaf.view instanceof ValidationView) await leaf.view.refresh();
          if (active()) await this.app.workspace.revealLeaf(leaf);
        } catch {
          if (!existing) leaf.detach();
          if (active()) new Notice("笔记校验侧栏打开失败，请重试。");
        } finally { openingValidation = null; }
      })();
    } });
    let initializing = false;
    this.addCommand({ id: "initialize-note", name: "初始化当前模板笔记的标识和时间", checkCallback: (checking) => {
      const path = this.app.workspace.getActiveFile()?.path;
      if (!active() || !path || !layout.isManaged(path) || layout.typeFor(path) === "jizhang") return false;
      if (!checking && !initializing) {
        initializing = true;
        void (async () => {
          const request = pendingInitializations.get(path) ?? await initializer.prepare(path); pendingInitializations.set(path, request);
          await initializer.execute(request); pendingInitializations.delete(path);
          if (active()) { new Notice("系统标识与时间已补齐；其他初稿字段请在原生编辑器完善。"); refreshing(); }
        })().catch((error: unknown) => { if (active()) new Notice(`初始化未确认完成，同次重试保留请求：${error instanceof Error ? error.message : String(error)}`, 15000); })
          .finally(() => { initializing = false; });
      }
      return true;
    } });
    const createNote = (type: NoteType): void => { if (active()) openTemplateModal(this.app, templates, type, active); };
    this.addCommand({ id: "edit-note-relations", name: "编辑当前日记或待办的关联", checkCallback: (checking) => {
      const path = this.app.workspace.getActiveFile()?.path;
      if (!active() || !path || !layout.isManaged(path) || !["riji", "daiban"].includes(String(layout.typeFor(path)))) return false;
      if (!checking) void notes.read(path).then((source) => editRelations(String(source.attributes.biaoshi))).catch((error: unknown) => { if (active()) new Notice(String(error)); });
      return true;
    } });
    for (const type of Object.keys(noteLabels) as NoteType[]) this.addCommand({ id: `create-${type}`, name: `新建${noteLabels[type]}笔记`, checkCallback: (checking) => {
      if (!active() || !this.activeSettings.qiyongmokuai.includes(type)) return false;
      if (!checking) createNote(type); return true;
    } });
    this.addCommand({ id: "install-note-templates", name: "安装九类笔记模板（保留已有）", callback: () => {
      void templates.install().then((results) => {
        if (!active()) return;
        const modal = new Modal(this.app); modal.contentEl.createEl("h2", { text: "模板安装结果" });
        for (const result of results) modal.contentEl.createEl("p", { text: `${result.lujing}：${result.jieguo}` });
        modal.open();
      }).catch((error: unknown) => { if (active()) new Notice(`模板安装未完成：${String(error)}`); });
    } });
    const notifyIndexFailure = (): void => { if (this.enabled && generation === this.generation) new Notice("LifeOS 索引更新失败，请执行重建索引。"); };
    this.registerEvent(this.app.vault.on("create", (file) => { if (file instanceof TFile) void index.changed(file.path).catch(notifyIndexFailure); }));
    this.registerEvent(this.app.vault.on("modify", (file) => { if (file instanceof TFile) void index.changed(file.path).catch(notifyIndexFailure); }));
    this.registerEvent(this.app.vault.on("delete", (file) => { void (file instanceof TFile ? index.removed(file.path) : index.rebuild()).catch(notifyIndexFailure); }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { void (file instanceof TFile ? index.changed(file.path, oldPath) : index.rebuild()).catch(notifyIndexFailure); }));
    this.addCommand({ id: "rebuild-index", name: "重建索引并查看结果", callback: () => {
      void index.rebuild().then(() => { if (this.enabled && generation === this.generation) new Notice(`索引已重建：${index.all().length}条有效记录，${index.issues().length}项问题。`, 10000); }).catch(notifyIndexFailure);
    } });
    this.app.workspace.onLayoutReady(() => { if (this.enabled && generation === this.generation) void index.rebuild().catch(notifyIndexFailure); });
    const integrity = new IntegrityCheck(index, files), trash = new TrashStore(index, clock);
    let inspecting = false, recycling = false;
    this.addCommand({ id: "open-trash", name: "查看回收记录", callback: () => {
      void trash.list().then((records) => {
        if (!this.enabled || generation !== this.generation) return;
        const modal = new Modal(this.app);
        modal.contentEl.createEl("h2", { text: "回收记录" });
        modal.contentEl.createEl("p", { text: `${records.length}条记录；恢复保留原标识和关联，争议记录需先修复。` });
        const list = modal.contentEl.createDiv({ cls: "lifeos-integrity-list" });
        for (const record of records) {
          const row = list.createDiv(); row.createEl("p", { text: record.path });
          const button = row.createEl("button", { text: "恢复" });
          button.addEventListener("click", () => {
            if (button.disabled || !this.enabled || generation !== this.generation) return;
            button.disabled = true;
            void trash.prepare(record, false).then((action) => operations.run({ caozuobiaoshi: ids.next(), buzhou: [action] }))
              .then(async () => { await index.changed(record.path); button.textContent = "已恢复"; })
              .catch((error: unknown) => {
                // Keep the captured version; request a fresh list after any uncertain save.
                button.textContent = "请重新打开列表核对";
                if (this.enabled && generation === this.generation) new Notice(`恢复未确认完成：${error instanceof Error ? error.message : String(error)}`, 12000);
              });
          });
        }
        modal.open();
      }).catch(notifyIndexFailure);
    } });
    this.addCommand({ id: "check-integrity", name: "检查数据完整性", callback: () => {
      if (inspecting || !this.enabled || generation !== this.generation) return;
      inspecting = true;
      void integrity.run().then((issues) => {
        if (!this.enabled || generation !== this.generation) return;
        const modal = new Modal(this.app);
        modal.contentEl.createEl("h2", { text: "数据完整性检查" });
        modal.contentEl.createEl("p", { text: `${index.all().length}条有效记录，${issues.length}项问题。检查保留原文件与关联，不自动修正。` });
        const list = modal.contentEl.createDiv({ cls: "lifeos-integrity-list" });
        for (const issue of issues) {
          const item = list.createDiv();
          item.createEl("strong", { text: issue.path });
          item.createEl("p", { text: issue.message });
        }
        modal.open();
      }).catch(notifyIndexFailure).finally(() => { inspecting = false; });
    } });
    for (const recycle of [true, false]) this.addCommand({
      id: recycle ? "recycle-record" : "restore-record", name: recycle ? "回收当前 LifeOS 记录" : "恢复当前 LifeOS 记录",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!this.enabled || generation !== this.generation || !file || !layout.isManaged(file.path)) return false;
        if (!checking && !recycling) {
          recycling = true;
          const store = layout.typeFor(file.path) === "jizhang" ? ledger : notes;
          void store.read(file.path).then((snapshot) => trash.prepare(snapshot, recycle))
            .then((action) => operations.run({ caozuobiaoshi: ids.next(), buzhou: [action] }))
            .then(async () => { await index.changed(file.path); if (this.enabled && generation === this.generation) new Notice(recycle ? "记录已回收，原文件和关联保留，可执行恢复命令。" : "记录已恢复，关联已重新纳入查询。缺失目标仍需检查。"); })
            .catch((error: unknown) => { if (this.enabled && generation === this.generation) new Notice(`操作未确认完成，请核对记录或操作日志：${error instanceof Error ? error.message : String(error)}`, 12000); })
            .finally(() => { recycling = false; });
        }
        return true;
      },
    });
    const openRecord = (id: string): void => {
      if (!active()) return;
      const record = index.find(id);
      if (!record) { new Notice("记录不存在、已回收或存在争议。"); return; }
      if (record.attributes.shiti === "jizhang") {
        const modal = new Modal(this.app); modal.contentEl.createEl("h2", { text: "记账记录（只读）" });
        for (const [key, value] of Object.entries(record.attributes)) {
          if (["biaoshi", "jiegoubanben", "shiti"].includes(key)) continue;
          const display = key === "jine" ? `¥${(Number(value) / 100).toFixed(2)}` : key === "shouzhi" ? (value === "shouru" ? "收入" : "支出") : Array.isArray(value) ? value.join("、") : String(value);
          modal.contentEl.createEl("p", { text: `${fieldNames[key] ?? key}：${display}` });
        }
        modal.open(); return;
      }
      const file = this.app.vault.getAbstractFileByPath(record.path);
      if (file instanceof TFile) void this.app.workspace.getLeaf(true).openFile(file).catch((error: unknown) => { if (active()) new Notice(`打开失败：${String(error)}`); });
    };
    this.addCommand({ id: "inspect-layout", name: "检查当前工作台布局", callback: () => {
      if (!active()) return;
      try {
        const view = this.app.workspace.getLeavesOfType(LIFEOS_VIEW_TYPE).map((leaf) => leaf.view).find((view) => view instanceof LifeOSView);
        if (!(view instanceof LifeOSView)) throw new Error("请先打开LifeOS页面再检查");
        const text = view.inspectLayout(), modal = new Modal(this.app); let closed = false;
        const dispose = () => modal.close(); this.relationModals.add(dispose);
        modal.onClose = () => { if (!closed) { closed = true; this.relationModals.delete(dispose); } };
        modal.contentEl.createEl("h2", { text: "当前工作台布局检查" });
        modal.contentEl.createEl("pre", { cls: "lifeos-layout-report", text }); modal.open();
      } catch (error) { if (active()) new Notice(error instanceof Error ? error.message : String(error)); }
    } });
    this.registerView(LIFEOS_VIEW_TYPE, (leaf) =>
      new LifeOSView(leaf, () => this.enabled && generation === this.generation, {
        home: { service: new SummaryService(index, clock, this.activeSettings.shiqu, this.activeSettings.qiyongmokuai), open: openRecord },
        enabledModules: this.activeSettings.qiyongmokuai,
        renderSettings: (body, footer) => renderLifeOSSettings(body, this, footer),
        onCreateNote: createNote,
        ...(this.activeSettings.qiyongmokuai.includes("xiangmu") ? { projects: { service: projects, files: { service: projectFiles, upload: uploadProjectFiles, open: openProjectFile, active }, create: () => createNote("xiangmu"), open: openRecord, relations: editRelations, manage: manageProject, active } } : {}),
        onCreateLedger: createLedger,
        ...(this.activeSettings.qiyongmokuai.includes("jizhang") ? { ledger: { table: ledgerTable, entry: ledgerEntry, create: createLedger, active, download: (format: "csv" | "json", text: string) => {
          if (!active()) return;
          const url = URL.createObjectURL(new Blob([text], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8" }));
          const link = document.createElement("a"); link.href = url; link.download = `LifeOS-记账.${format}`;
          document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } } } : {}),
        ...(this.activeSettings.qiyongmokuai.includes("zhishi") ? { knowledge: { service: knowledge, create: () => createNote("zhishi"), open: openRecord } } : {}),
        ...(this.activeSettings.qiyongmokuai.includes("lvxing") ? { travel: { service: travel, create: () => createNote("lvxing"), open: openRecord } } : {}),
        ...(this.activeSettings.qiyongmokuai.includes("yanchu") ? { performances: { service: performances, create: () => createNote("yanchu"), open: openRecord } } : {}),
        ...(this.activeSettings.qiyongmokuai.includes("youxi") ? { game: { service: game, create: () => createNote("youxi"), open: openRecord } } : {}),
        ...(this.activeSettings.qiyongmokuai.includes("yingshi") ? { film: { service: film, create: () => createNote("yingshi"), open: openRecord } } : {}),
        ...(this.activeSettings.qiyongmokuai.includes("yuedu") ? { reading: { service: reading, create: () => createNote("yuedu"), open: openRecord } } : {}),
        ...(this.activeSettings.qiyongmokuai.includes("daiban") ? { tasks: { list: taskList, service: tasks, create: () => createNote("daiban"), open: openRecord, progress: editTask, relations: editRelations } } : {}),
        ...(this.activeSettings.qiyongmokuai.includes("riji") ? { journal: { service: journals, relations: { service: journalContext, open: openRecord, edit: editRelations }, openPath: async (path: string) => {
          if (!active()) throw new Error("插件已停止");
          if (!layout.isManaged(path) || layout.typeFor(path) !== "riji") throw new Error("日记路径无效");
          const file = this.app.vault.getAbstractFileByPath(path);
          if (!(file instanceof TFile)) throw new Error("日记文件不存在或尚未同步");
          await this.app.workspace.getLeaf(true).openFile(file);
        } } } : {}),
        review: { service: search, editRelations, open: openRecord },
        periodReview: { service: new PeriodReviewService(index, clock, this.activeSettings.shiqu, this.activeSettings.qiyongmokuai), open: openRecord },
      }),
    );
    this.addCommand({
      id: "open-lifeos",
      name: "打开 LifeOS",
      callback: () => this.requestOpen(),
    });
    this.addRibbonIcon("layout-dashboard", "打开 LifeOS", () => this.requestOpen());
    this.addCommand({
      id: "run-host-check", name: "运行宿主验收（仅生成独立测试数据）",
      callback: () => {
        if (this.checking || !this.enabled) return;
        this.checking = true;
        new Notice("LifeOS 正在独立验收目录生成合成数据，请等待报告。");
        void runHostCheck(this.app.vault, () => this.enabled && generation === this.generation)
          .then((path) => { if (this.enabled && generation === this.generation) new Notice(`验收结束，请打开报告：${path}`, 15000); })
          .catch((error: unknown) => { if (this.enabled && generation === this.generation) new Notice(`验收报告未能保存：${error instanceof Error ? error.message : String(error)}`, 15000); })
          .finally(() => { if (generation === this.generation) this.checking = false; });
      },
    });
    this.addSettingTab(new LifeOSSettingTab(this.app, this));
  }

  requestOpen(): void {
    void this.openLifeOS().catch(() => {
      if (this.enabled) new Notice("LifeOS 打开失败，请重试。");
    });
  }

  openLifeOS(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    if (this.opening) return this.opening;
    const operation = this.activateView(this.generation);
    this.opening = operation;
    const clear = (): void => {
      if (this.opening === operation) this.opening = null;
    };
    void operation.then(clear, clear);
    return operation;
  }

  private async activateView(generation: number): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(LIFEOS_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf(true);
    try {
      if (!existing) await leaf.setViewState({ type: LIFEOS_VIEW_TYPE, active: true });
      if (!this.enabled || generation !== this.generation) {
        if (!existing) leaf.detach();
        return;
      }
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      if (!existing) leaf.detach();
      throw error;
    }
  }

  override onunload(): void {
    for (const close of this.relationModals) close();
    this.relationModals.clear();
    this.enabled = false;
    this.generation += 1;
    this.opening = null;
    this.stores = null;
    this.settingsStore = null;
    this.settingsSnapshot = null;
    this.index?.stop();
    this.index = null;
    this.checking = false;
    // Dispose synchronously: workspace closing hooks may finish after plugin unload.
    for (const leaf of this.app.workspace.getLeavesOfType(LIFEOS_VIEW_TYPE)) {
      if (leaf.view instanceof LifeOSView) leaf.view.dispose();
    }
    this.app.workspace.detachLeavesOfType(LIFEOS_VIEW_TYPE);
    for (const leaf of this.app.workspace.getLeavesOfType(VALIDATION_VIEW_TYPE)) if (leaf.view instanceof ValidationView) leaf.view.dispose();
    this.app.workspace.detachLeavesOfType(VALIDATION_VIEW_TYPE);
  }
}
