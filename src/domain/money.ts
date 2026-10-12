export function yuanToFen(input: string): number {
  if (typeof input !== "string") throw new Error("金额须以元的十进制文本填写");
  const value = input.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("金额须为正数，最多两位小数");
  const [yuan = "", fraction = ""] = value.split(".");
  const fen = BigInt(yuan) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (fen <= 0n || fen > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("金额超出安全范围");
  return Number(fen);
}
export function fenToYuan(fen: number): string {
  if (!Number.isSafeInteger(fen)) throw new Error("金额须为安全整数分");
  const amount = BigInt(fen);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function jizhangHuizong(rows: readonly { shouzhi: "shouru" | "zhichu"; jine: number; yihuishou?: boolean }[]): { shouru: number; zhichu: number; jieyu: number } {
  let shouru = 0n, zhichu = 0n;
  for (const row of rows) {
    if (row.yihuishou) continue;
    if (!Number.isSafeInteger(row.jine) || row.jine <= 0) throw new Error("记账金额无效");
    if (row.shouzhi === "shouru") shouru += BigInt(row.jine);
    else if (row.shouzhi === "zhichu") zhichu += BigInt(row.jine);
    else throw new Error("收支类型无效");
  }
  if (shouru > BigInt(Number.MAX_SAFE_INTEGER) || zhichu > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("累计金额超出安全范围");
  return { shouru: Number(shouru), zhichu: Number(zhichu), jieyu: Number(shouru - zhichu) };
}
