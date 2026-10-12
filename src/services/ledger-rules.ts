import { activeCategories, type Settings } from "../settings/settings-store";
export interface LedgerCategory { shouzhi: "shouru" | "zhichu"; fenlei: string }
// An unchanged historical pair may remain on an existing row; new assignments require an enabled category.
export function assertLedgerCategory(settings: Settings, value: LedgerCategory, previous?: LedgerCategory): void {
  if (!["shouru", "zhichu"].includes(value.shouzhi) || typeof value.fenlei !== "string" || !value.fenlei.trim() || value.fenlei !== value.fenlei.trim()) throw new Error("收支类型或分类无效");
  if (previous && previous.shouzhi === value.shouzhi && previous.fenlei === value.fenlei) return;
  if (!activeCategories(settings, value.shouzhi).includes(value.fenlei)) throw new Error("请选择此收支类型的启用分类");
}
