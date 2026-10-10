import type { Shiti } from "../domain/entities";
import { shiti } from "../domain/entities";
import type { FileSystem } from "../ports/file-system";
import { StoreError } from "../domain/errors";
import { JsonCodec } from "../storage/codecs";
import { cloneData, dataObject } from "../storage/data-values";
import { StorageLayout, moduleFolders } from "../storage/paths";

export const settingsPath = "LifeOS配置/shezhi.json";
export interface Category { shouzhi: "shouru" | "zhichu"; fenlei: string; qiyong: boolean }
export interface Settings extends Record<string, unknown> {
  jiegoubanben: 2; genmulu: string; mulu: Record<Shiti, string>; qiyongmokuai: Shiti[];
  shiqu: string; fujianzuidadaxiao: number; fenlei: Category[];
}
export interface SettingsSnapshot { yuanwen: string | null; shuju: Settings }
const owned = ["genmulu", "mulu", "qiyongmokuai", "shiqu", "fujianzuidadaxiao", "fenlei"];
export function defaultSettings(): Settings {
  return { jiegoubanben: 2, genmulu: "LifeOS", mulu: { ...moduleFolders }, qiyongmokuai: [...shiti], shiqu: "Asia/Shanghai", fujianzuidadaxiao: 20 * 1024 * 1024,
    fenlei: [{ shouzhi: "shouru", fenlei: "其他收入", qiyong: true }, { shouzhi: "zhichu", fenlei: "餐饮", qiyong: true }, { shouzhi: "zhichu", fenlei: "其他支出", qiyong: true }] };
}
export function validateSettings(input: unknown): Settings {
  const data = dataObject(input);
  const fail = (message: string): never => { throw new StoreError("validation", message, settingsPath); };
  if (data.jiegoubanben !== 2) throw new StoreError("unsupported_version", "未知设置版本，保留只读", settingsPath);
  if (typeof data.genmulu !== "string") fail("根目录需要文本");
  const folders = dataObject(data.mulu);
  if (shiti.some((type) => typeof folders[type] !== "string") || Object.keys(folders).some((type) => !shiti.includes(type as Shiti))) fail("十类模块目录必须完整且使用拼音类型");
  const layout = new StorageLayout(data.genmulu as string, folders as Record<Shiti, string>);
  if (layout.root === "LifeOS配置" || layout.root.startsWith("LifeOS配置/") || layout.root === "LifeOS验收" || layout.root.startsWith("LifeOS验收/")) fail("业务根不能使用设置或验收目录");
  if (!Array.isArray(data.qiyongmokuai) || data.qiyongmokuai.some((type) => !shiti.includes(type as Shiti)) || new Set(data.qiyongmokuai).size !== data.qiyongmokuai.length) fail("启用模块列表无效或重复");
  if (typeof data.shiqu !== "string" || !data.shiqu) fail("时区需要有效名称");
  try { new Intl.DateTimeFormat("zh-CN", { timeZone: data.shiqu as string }).format(new Date(0)); } catch { fail("时区无效或宿主不支持"); }
  if (typeof data.fujianzuidadaxiao !== "number" || !Number.isSafeInteger(data.fujianzuidadaxiao) || data.fujianzuidadaxiao <= 0) fail("附件大小需要正安全整数（字节）");
  if (!Array.isArray(data.fenlei)) fail("分类需要列表");
  const seen = new Set<string>();
  for (const value of data.fenlei as unknown[]) {
    const category = dataObject(value);
    if (!["shouru", "zhichu"].includes(String(category.shouzhi)) || typeof category.fenlei !== "string" || !category.fenlei.trim() || category.fenlei !== category.fenlei.trim() || typeof category.qiyong !== "boolean") fail("收支分类需要类型、非空名称和启用状态");
    const key = JSON.stringify([category.shouzhi, category.fenlei]);
    if (seen.has(key)) fail("同一收支类型不能有重复分类"); seen.add(key);
  }
  return cloneData(data) as Settings;
}
export function activeCategories(settings: Settings, kind: Category["shouzhi"]): string[] {
  return settings.fenlei.filter((entry) => entry.qiyong && entry.shouzhi === kind).map((entry) => entry.fenlei);
}
export class SettingsStore {
  private readonly codec = new JsonCodec();
  constructor(private readonly fs: FileSystem) {}
  async read(): Promise<SettingsSnapshot> {
    let raw: string;
    try { raw = await this.fs.read(settingsPath); }
    catch (error) { if (error instanceof StoreError && error.code === "not_found") return { yuanwen: null, shuju: defaultSettings() }; throw error; }
    return { yuanwen: raw, shuju: validateSettings(this.codec.decode(raw).attributes) };
  }
  async save(snapshot: SettingsSnapshot, patch: Readonly<Record<string, unknown>>): Promise<SettingsSnapshot> {
    const captured = cloneData(snapshot), edit = cloneData(dataObject(patch));
    if (Object.keys(edit).some((field) => !owned.includes(field))) throw new StoreError("validation", "不能改写设置版本或未知属性");
    const before = captured.yuanwen === null ? defaultSettings() : validateSettings(this.codec.decode(captured.yuanwen).attributes);
    const next = validateSettings({ ...before, ...edit });
    const after = captured.yuanwen === null ? this.codec.create(next, "") : this.codec.update(captured.yuanwen, next, "");
    if (captured.yuanwen === null) await this.fs.create(settingsPath, after);
    else await this.fs.process(settingsPath, (current) => {
      if (current !== captured.yuanwen) throw new StoreError("conflict", "设置已被其他操作修改，请重新加载插件后核对设置");
      return after;
    });
    return { yuanwen: after, shuju: cloneData(next) };
  }
}
