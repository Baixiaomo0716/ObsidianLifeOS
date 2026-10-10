import { type App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LifeOSPlugin from "../main";
import { cloneData } from "../storage/data-values";
import { shiti } from "../domain/entities";
import { settingsPath } from "./settings-store";

const labels = { riji: "日记", jizhang: "记账", yuedu: "阅读", yingshi: "影视", youxi: "游戏", yanchu: "演出", lvxing: "旅行", zhishi: "知识", daiban: "待办", xiangmu: "项目" };

export class LifeOSSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly lifeOS: LifeOSPlugin) {
    super(app, lifeOS);
  }

  override display(): void {
    renderLifeOSSettings(this.containerEl, this.lifeOS);
  }

  override hide(): void {
    this.containerEl.replaceChildren();
    this.containerEl.classList.remove("lifeos-settings");
  }
}

export function renderLifeOSSettings(containerEl: HTMLElement, lifeOS: LifeOSPlugin, footer?: HTMLElement): void {
  footer?.replaceChildren();
    containerEl.replaceChildren();
    containerEl.classList.add("lifeos-settings");
    const heading = containerEl.ownerDocument.createElement("h2");
    heading.textContent = "LifeOS";
    containerEl.appendChild(heading);
    new Setting(containerEl)
      .setName("打开工作台")
      .setDesc("打开或切换到已有的 LifeOS 标签页。")
      .addButton((button) => button.setButtonText("打开 LifeOS").onClick(() => lifeOS.requestOpen()));
    const hint = containerEl.ownerDocument.createElement("p");
    hint.className = "lifeos-settings-hint";
    hint.textContent = `配置保存于 ${settingsPath}。保存后重新加载生效；未保存离开会放弃修改。更改目录不搬迁文件，停用模块或分类保留历史数据。`;
    containerEl.appendChild(hint);
    const snapshot = lifeOS.settingsSnapshot;
    if (!snapshot) {
      hint.textContent = `配置读取失败，业务服务已暂停。请检查 ${settingsPath} 原文件；不会自动覆盖未知版本或非法配置。`;
      return;
    }
    const draft = cloneData(snapshot.shuju);
    new Setting(containerEl).setName("业务根目录").setDesc("Vault内的相对目录，默认 LifeOS。切换后原目录文件仍保留。")
      .addText((text) => text.setValue(draft.genmulu).onChange((value) => { draft.genmulu = value; }));
    new Setting(containerEl).setName("时区").setDesc("用于后续今日与业务日期计算，例如 Asia/Shanghai。不会改写历史日期。")
      .addText((text) => text.setValue(draft.shiqu).onChange((value) => { draft.shiqu = value; }));
    let size = String(draft.fujianzuidadaxiao);
    new Setting(containerEl).setName("单附件大小上限（字节）").setDesc("默认20971520，即20MiB。实际导入能力在附件模块接入。")
      .addText((text) => text.setValue(size).onChange((value) => { size = value; }));
    for (const type of shiti) {
      new Setting(containerEl).setName(`${labels[type]}模块`).setDesc("停用只隐藏后续入口，索引和历史数据仍保留。")
        .addToggle((toggle) => toggle.setValue(draft.qiyongmokuai.includes(type)).onChange((value) => {
          draft.qiyongmokuai = draft.qiyongmokuai.filter((item) => item !== type); if (value) draft.qiyongmokuai.push(type);
        }));
      new Setting(containerEl).setName(`${labels[type]}目录`).setDesc("相对业务根，十类目录不能重叠。")
        .addText((text) => text.setValue(draft.mulu[type]).onChange((value) => { draft.mulu[type] = value; }));
    }
    const categories = containerEl.ownerDocument.createElement("h3"); categories.textContent = "收支分类"; containerEl.appendChild(categories);
    for (const category of draft.fenlei) new Setting(containerEl).setName(category.shouzhi === "shouru" ? "收入分类" : "支出分类")
      .setDesc("名称修改仅影响新记录选项；关闭开关即可停用，不改历史账本。")
      .addText((text) => text.setValue(category.fenlei).onChange((value) => { category.fenlei = value; }))
      .addToggle((toggle) => toggle.setValue(category.qiyong).onChange((value) => { category.qiyong = value; }));
    let newIncome = "", newExpense = "";
    new Setting(containerEl).setName("添加收入分类").addText((text) => text.onChange((value) => { newIncome = value; }));
    new Setting(containerEl).setName("添加支出分类").addText((text) => text.onChange((value) => { newExpense = value; }));
    new Setting(footer ?? containerEl).setName("保存设置").setDesc("修改只在点击保存后写入，重新加载插件后生效。")
      .addButton((button) => button.setButtonText("保存").onClick(() => {
        if (!/^\d+$/.test(size)) { new Notice("附件大小请输入正整数字节数。"); return; }
        const edited = cloneData(draft); edited.fujianzuidadaxiao = Number(size);
        for (const [kind, name] of [["shouru", newIncome], ["zhichu", newExpense]] as const) if (name.trim()) edited.fenlei.push({ shouzhi: kind, fenlei: name.trim(), qiyong: true });
        button.setDisabled(true);
        void lifeOS.saveSettings({ genmulu: edited.genmulu, mulu: edited.mulu, qiyongmokuai: edited.qiyongmokuai, shiqu: edited.shiqu, fujianzuidadaxiao: edited.fujianzuidadaxiao, fenlei: edited.fenlei })
          .then(() => renderLifeOSSettings(containerEl, lifeOS, footer))
          .catch((error: unknown) => { new Notice(`设置未确认保存：${error instanceof Error ? error.message : String(error)}`, 12000); button.setDisabled(false); });
      }));

}
