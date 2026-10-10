import { JsonCodec, MarkdownCodec } from "../storage/codecs";
import { StoreError } from "../domain/errors";
import { shiti } from "../domain/entities";
import { sameData } from "../storage/data-values";
export function migrateEntityFields(raw: string, kind: "note" | "ledger", zone: string): string {
  const codec = kind === "note" ? new MarkdownCodec() : new JsonCodec();
  const before = codec.decode(raw), attributes = { ...before.attributes };
  if (!shiti.includes(attributes.shiti as typeof shiti[number]) || attributes.jiegoubanben !== 2) throw new StoreError("unsupported_version", "类型或结构版本未知，保留原文件");
  if ((attributes.shiti === "jizhang") !== (kind === "ledger")) throw new StoreError("invalid_format", "笔记与记账来源不一致");
  if (kind === "note") { attributes.shuxingmoshi = "tongyi"; attributes.bijishiqu ??= zone; attributes.biaoqian ??= []; if (attributes.shiti === "zhishi") attributes.jindu ??= "weikaishi"; }
  if (["riji", "daiban"].includes(String(attributes.shiti))) attributes.biaoqian ??= [];
  const result = codec.update(raw, attributes, before.body), after = codec.decode(result);
  if (!sameData(after.attributes, attributes) || after.body !== before.body) throw new StoreError("invalid_format", "字段迁移往返不一致，未写入");
  return result;
}
