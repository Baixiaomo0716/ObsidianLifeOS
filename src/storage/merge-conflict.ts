// A complete Git conflict block is disputed content, including when it is in
// the free Markdown body. A lone marker or prose mention is not a block.
export function hasMergeConflict(raw: string): boolean {
  return /^<{7} [^\r\n]*\r?\n[\s\S]*?^={7}\r?\n[\s\S]*?^>{7} [^\r\n]*(?:\r?\n|$)/m.test(raw);
}
