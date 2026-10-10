export const shiqu = "Asia/Shanghai";
export const nongliFanwei = { kaishi: "1901-01-01", jieshu: "2100-12-31" } as const;
export function isRiqi(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const instant = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}
export function isShijian(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!parts && isRiqi(parts[1]) && Number(parts[2]) < 24 && Number(parts[3]) < 60 && Number(parts[4]) < 60
    && (parts[5] === "Z" || (Number(parts[6]) <= 14 && Number(parts[7]) < 60 && (Number(parts[6]) < 14 || Number(parts[7]) === 0)))
    && Number.isFinite(Date.parse(value));
}
export function xingqi(riqi: string): string {
  if (!isRiqi(riqi)) throw new Error("日期无效");
  return `星期${["日", "一", "二", "三", "四", "五", "六"][new Date(`${riqi}T12:00:00Z`).getUTCDay()]}`;
}
export function jinri(now: string, zone = shiqu): string {
  if (!isShijian(now)) throw new Error("当前时间须包含时区偏移");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function nongli(riqi: string): string {
  if (!isRiqi(riqi)) throw new Error("日期无效");
  if (riqi < nongliFanwei.kaishi || riqi > nongliFanwei.jieshu) throw new Error("农历仅支持1901–2100年");
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { timeZone: shiqu, year: "numeric", month: "long", day: "numeric" });
    if (formatter.resolvedOptions().calendar !== "chinese") throw new Error();
    const parts = formatter.formatToParts(new Date(`${riqi}T12:00:00+08:00`));
    const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
    const year = value("relatedYear"), month = value("month"), day = Number(value("day"));
    if (!/^\d{4}$/.test(year) || !/^(闰)?(正|二|三|四|五|六|七|八|九|十|十一|十二|冬|腊)月$/.test(month) || !Number.isInteger(day) || day < 1 || day > 30) throw new Error();
    const digits = "〇一二三四五六七八九";
    const dayName = day <= 10 ? `初${day === 10 ? "十" : digits[day]}` : day < 20 ? `十${digits[day - 10]}` : day === 20 ? "二十" : day < 30 ? `廿${digits[day - 20]}` : "三十";
    // Canonicalize ICU's alternative month names so saved values stay stable.
    const monthName = month.replace("冬月", "十一月").replace("腊月", "十二月");
    return `${Array.from(year, (digit) => digits[Number(digit)]).join("")}年${monthName}${dayName}`;
  } catch { throw new Error("当前宿主不支持可靠的中国农历，请保留原记录并提示不可用"); }
}
