/** Extract open Markdown tasks, excluding examples inside code and comments. */
export function bodyTodos(body: string): { text: string; line: number }[] {
  const result: { text: string; line: number }[] = [];
  let fence = "", fenceLength = 0;
  const lines = body.replace(/<!--[\s\S]*?(?:-->|$)/g, value => value.replace(/[^\n]/g, "")).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) { fence = marker[1]![0]!; fenceLength = marker[1]!.length; }
      else if (marker[1]![0] === fence && marker[1]!.length >= fenceLength && !marker[2]!.trim()) fence = "";
      continue;
    }
    if (fence) continue;
    const task = /^\s*(?:[-+*]|\d+[.)])\s+\[ \]\s+(.+?)\s*$/.exec(line);
    if (task?.[1]?.trim()) result.push({ text: task[1].trim(), line: index + 1 });
  }
  return result;
}
