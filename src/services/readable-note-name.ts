import { safePath } from "../storage/paths";
export function readableNoteName(current: string, occupied: ReadonlySet<string>): string {
  safePath(current);
  const clean = current.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\.md$)/i, "");
  if (clean === current) return current;
  safePath(clean);
  let candidate = clean, number = 2;
  while (occupied.has(candidate.toLowerCase())) candidate = clean.slice(0, -3) + `（${number++}）.md`;
  return safePath(candidate);
}
