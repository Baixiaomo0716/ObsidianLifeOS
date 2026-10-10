import { isRiqi } from "./date";
// Native Date & time widgets may save a local minute value without an offset.
// Resolve it using the note's saved zone, never the computer's current zone.
export function nativeTime(value: unknown, zone: string): unknown {
  if (typeof value !== "string") return value;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return value;
  if (!isRiqi(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) return value;
  const target = `${match[1]}T${match[2]}:${match[3]}:${match[4] ?? "00"}`;
  const local = Date.parse(`${target}Z`);
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const display = (instant: number): string => {
    const parts = formatter.formatToParts(new Date(instant));
    const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
  };
  const offsets = new Set<number>();
  for (const days of [-2, -1, 0, 1, 2]) {
    const instant = local + days * 86400000;
    offsets.add(Date.parse(`${display(instant)}Z`) - instant);
  }
  const candidates = [...offsets].map((offset) => local - offset).filter((instant) => display(instant) === target);
  if (candidates.length !== 1) throw new Error("本地日期时间不存在或因夏令时重复，请在源模式填写带偏移的时间");
  return new Date(candidates[0]!).toISOString();
}
