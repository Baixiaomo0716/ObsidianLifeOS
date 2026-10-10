import { JsonCodec } from "../storage/codecs";
export function propertyTypes(raw: string): string {
  const value: unknown = new JsonCodec().decode(raw).attributes;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("属性类型配置格式无效");
  const config = value as Record<string, unknown>;
  if (config.types !== undefined && (!config.types || typeof config.types !== "object" || Array.isArray(config.types))) throw new Error("属性类型映射无效，未覆盖原配置");
  const existing = { ...(config.types as Record<string, unknown> | undefined) };
  delete existing["标签"];
  return JSON.stringify({ ...config, types: { ...existing,
    创建时间: "datetime", 更新时间: "datetime", 日期: "date", 开始日期: "date", 截止日期: "date", 结束日期: "date", tags: "tags", 进度: "multitext",
    开始时间: "datetime", 读完时间: "datetime", 观看时间: "datetime", 时间: "datetime", 完成时间: "datetime", 取消时间: "datetime", 回收时间: "datetime",
    上映时间: "date", 发行时间: "date", 评分: "number", 豆瓣评分: "number", 字数: "number", 金额: "number", 结构版本: "number" } }, null, 2) + "\n";
}
