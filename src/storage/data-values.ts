import { StoreError } from "../domain/errors";
// Refuse values that would be silently coerced or lost by either encoder.
export function assertData(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return;
  if (typeof value !== "object" || !value || seen.has(value)) throw new StoreError("invalid_format", "属性包含无法安全往返的值");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new StoreError("invalid_format", "属性只能包含普通数据对象");
  if (Object.getOwnPropertySymbols(value).length) throw new StoreError("invalid_format", "属性不能包含Symbol键");
  seen.add(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) assertData(item, seen);
  seen.delete(value);
}
export function dataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StoreError("invalid_format", "属性必须是映射对象");
  assertData(value);
  return value as Record<string, unknown>;
}
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every((key) => hasOwn(b, key) && sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
export function hasOwn(value: object, key: PropertyKey): boolean { return Object.prototype.hasOwnProperty.call(value, key); }
export function cloneData<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => cloneData(item)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)])) as T;
  return value;
}
