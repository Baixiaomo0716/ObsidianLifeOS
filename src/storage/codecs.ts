import { hasMergeConflict } from "./merge-conflict";
import { Document, isAlias, isMap, isScalar, parseDocument, Scalar, visit } from "yaml";
import { StoreError } from "../domain/errors";
import { dataObject, hasOwn, sameData } from "./data-values";
import { nativeTime } from "../domain/native-time";
import { chineseFields, internalFields, isEntity, fieldNames } from "./chinese-fields";
export interface Decoded { attributes: Record<string, unknown>; body: string }
export interface Codec {
  decode(raw: string): Decoded;
  create(attributes: Record<string, unknown>, body: string): string;
  update(raw: string, attributes: Record<string, unknown>, body: string): string;
}
function yamlDocument(source: string): Document {
  const doc = parseDocument(source, { version: "1.2", schema: "core", uniqueKeys: true, strict: true, intAsBigInt: true });
  if (doc.errors.length || doc.warnings.length || !isMap(doc.contents)) throw new StoreError("invalid_format", "YAML非法、重复键或不是属性映射", undefined, [...doc.errors, ...doc.warnings]);
  visit(doc, (_key, node) => {
    if (isAlias(node)) throw new StoreError("invalid_format", "带别名的YAML只读，不能安全局部修改");
    if (isMap(node) && node.items.some((pair) => !isScalar(pair.key) || typeof pair.key.value !== "string")) throw new StoreError("invalid_format", "YAML映射键须为字符串");
    if (isScalar(node) && typeof node.value === "bigint") {
      if (node.value > BigInt(Number.MAX_SAFE_INTEGER) || node.value < BigInt(Number.MIN_SAFE_INTEGER)) throw new StoreError("invalid_format", "YAML整数超出安全范围，保留只读");
      node.value = Number(node.value);
    }
  });
  dataObject(doc.toJS({ maxAliasCount: 0 }));
  return doc;
}
function splitNote(raw: string): { yaml: string; body: string; bom: string; eol: string; closingEol: string } {
  const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
  const text = raw.slice(bom.length);
  const opening = /^---(\r?\n)/.exec(text);
  if (!opening) throw new StoreError("invalid_format", "笔记需要以YAML属性块开头");
  const start = opening[0].length;
  const closing = /^---[ \t]*(\r?\n|$)/m.exec(text.slice(start));
  if (!closing) throw new StoreError("invalid_format", "YAML属性块缺少结束分隔符");
  const end = start + closing.index;
  return { yaml: text.slice(start, end), body: text.slice(end + closing[0].length), bom, eol: opening[1]!, closingEol: closing[1] ?? "" };
}
function setValue(doc: Document, field: string, value: unknown): void {
  const node = doc.createNode(value);
  if (isScalar(node) && typeof value === "string") node.type = value.includes("\n") && !value.includes("\r") ? Scalar.BLOCK_LITERAL : Scalar.QUOTE_DOUBLE;
  doc.set(field, node);
}
function renderNote(doc: Document, body: string, bom: string, eol: string, closingEol: string): string {
  const yaml = doc.toString({ lineWidth: 0 }).replace(/\n/g, eol);
  return `${bom}---${eol}${yaml}---${closingEol || (body ? eol : "")}${body}`;
}
const metadataPrefix = "<!-- lifeos-shuxing ";
const progressLabels: Record<string, string> = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
function hiddenFields(attributes: Record<string, unknown>): string[] {
  return ["shuxingmoshi", "bijishiqu", ...(attributes.shuxingmoshi === "tongyi" ? ["biaoshi", "mingcheng", "yiguidang", "yiquxiao"] : []),
    ...(attributes.shiti === "riji" ? ["biaoshi", "neirong", "guanlian"] : attributes.shiti === "daiban" ? ["mingcheng", "neirong", "guanlian", "yiguidang", "yiquxiao"]
      : attributes.shiti === "xiangmu" ? ["daiban", "shangchuanwenjian", "neirong", "yiguidang", "yiquxiao"] : [])];
}
function visibleAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const result = { ...attributes };
  if (!["jianjie", "tongyi"].includes(String(result.shuxingmoshi))) return result;
  for (const key of hiddenFields(attributes)) delete result[key];
  if (attributes.shuxingmoshi === "tongyi") {
    result.tags = result.biaoqian ?? []; delete result.biaoqian;
    if (result.shiti !== "riji") {
      const field = result.shiti === "yuedu" ? "zhuangtai" : "jindu";
      const value = result[field]; delete result[field];
      result.jindu = [typeof value === "string" ? progressLabels[value] ?? value : value];
    }
    return result;
  }
  if (result.shiti === "xiangmu" && typeof result.jindu === "string") result.jindu = progressLabels[result.jindu] ?? result.jindu;
  return result;
}
function storedBody(attributes: Record<string, unknown>, body: string): string {
  const hidden = Object.fromEntries(Object.entries(attributes).filter(([key]) => hiddenFields(attributes).includes(key) && ["jianjie", "tongyi"].includes(String(attributes.shuxingmoshi))));
  // Encode JSON before placing it in an HTML comment: user text cannot close the comment.
  return Object.keys(hidden).length ? `${metadataPrefix}${encodeURIComponent(JSON.stringify(chineseFields(hidden))).replaceAll("-", "%2D")} -->\n${body}` : body;
}
export class MarkdownCodec implements Codec {
  decode(raw: string): Decoded {
    if (hasMergeConflict(raw)) throw new StoreError("invalid_format", "笔记包含未解决的Git冲突块，请核对双方版本后手动处理；不会自动覆盖");
    const parts = splitNote(raw);
    const rawAttributes = dataObject(yamlDocument(parts.yaml).toJS({ maxAliasCount: 0 }));
    if (hasOwn(rawAttributes, "tags")) {
      if (hasOwn(rawAttributes, "标签") && hasOwn(rawAttributes, "biaoqian")) throw new StoreError("invalid_format", "中文与拼音标签重复，不能自动合并");
      if (typeof rawAttributes.tags === "string") rawAttributes.tags = [rawAttributes.tags];
      const legacy = rawAttributes["标签"] ?? rawAttributes.biaoqian;
      if (legacy !== undefined && (!Array.isArray(legacy) || !Array.isArray(rawAttributes.tags))) throw new StoreError("invalid_format", "tags与旧标签无法安全合并");
      rawAttributes["标签"] = legacy === undefined ? rawAttributes.tags : [...new Set([...(legacy as unknown[]), ...(rawAttributes.tags as unknown[])])];
      delete rawAttributes.tags; delete rawAttributes.biaoqian;
    }
    const attributes = internalFields(rawAttributes);
    if (Array.isArray(attributes.jindu)) {
      const values = attributes.jindu.map((item) => Object.entries(progressLabels).find(([, label]) => item === label)?.[0] ?? item);
      const field = attributes.shiti === "yuedu" ? "zhuangtai" : "jindu";
      if (field === "zhuangtai" && hasOwn(attributes, field)) throw new StoreError("invalid_format", "状态和进度重复");
      delete attributes.jindu; attributes[field] = values.length === 1 ? values[0] : values;
    }
    if (!parts.body.startsWith(metadataPrefix)) return { attributes, body: parts.body };
    const closing = / -->\r?\n/.exec(parts.body);
    if (!closing) throw new StoreError("invalid_format", "系统信息注释不完整");
    const end = closing.index;
    let hidden: Record<string, unknown>;
    try { hidden = internalFields(dataObject(JSON.parse(decodeURIComponent(parts.body.slice(metadataPrefix.length, end))))); }
    catch { throw new StoreError("invalid_format", "系统信息注释损坏，保留原文"); }
    if (!["jianjie", "tongyi"].includes(String(hidden.shuxingmoshi)) || Object.keys(hidden).some((key) => hasOwn(attributes, key))) throw new StoreError("invalid_format", "系统信息与笔记属性冲突");
    const merged = { ...attributes, ...hidden };
    if (merged.shiti === "xiangmu") for (const [value, label] of Object.entries(progressLabels)) if (merged.jindu === label) merged.jindu = value;
    const hiddenKeys = Object.keys(hidden);
    const allowedHidden = new Set(hiddenFields(merged));
    if (hiddenKeys.some((key) => !allowedHidden.has(key))) throw new StoreError("invalid_format", "系统信息包含不允许隐藏的属性");
    if (typeof merged.bijishiqu === "string") try {
      for (const field of ["chuangjianshijian", "gengxinshijian", "kaishishijian", "duwanshijian", "guankanshijian", "shijian", "wanchengshijian", "quxiaoshijian", "huishoushijian"]) if (hasOwn(merged, field)) merged[field] = nativeTime(merged[field], merged.bijishiqu);
    } catch (error) { throw new StoreError("invalid_format", String(error)); }
    return { attributes: merged, body: parts.body.slice(end + closing[0].length) };
  }
  create(attributes: Record<string, unknown>, body = ""): string {
    dataObject(attributes);
    const doc = new Document({}, { version: "1.2", schema: "core" });
    for (const [field, value] of Object.entries(chineseFields(visibleAttributes(attributes)))) setValue(doc, field, value);
    const raw = renderNote(doc, storedBody(attributes, body), "", "\n", "\n");
    this.verify(raw, attributes, body);
    return raw;
  }
  update(raw: string, attributes: Record<string, unknown>, body: string): string {
    dataObject(attributes);
    this.decode(raw);
    const parts = splitNote(raw), doc = yamlDocument(parts.yaml);
    if (isMap(doc.contents)) for (const pair of doc.contents.items) {
      if (isScalar(pair.key) && typeof pair.key.value === "string" && fieldNames[pair.key.value]) pair.key.value = fieldNames[pair.key.value]!;
    }
    const old = dataObject(doc.toJS({ maxAliasCount: 0 }));
    const visible = chineseFields(visibleAttributes(attributes));
    for (const key of Object.keys(old)) if (!hasOwn(visible, key)) doc.delete(key);
    for (const [field, value] of Object.entries(visible)) if (!hasOwn(old, field) || !sameData(old[field], value)) setValue(doc, field, value);
    const result = renderNote(doc, storedBody(attributes, body), parts.bom, parts.eol, parts.closingEol);
    this.verify(result, attributes, body);
    return result;
  }
  private verify(raw: string, attributes: Record<string, unknown>, body: string): void {
    const decoded = this.decode(raw);
    if (!sameData(decoded.attributes, attributes) || decoded.body !== body) throw new StoreError("invalid_format", "YAML往返校验失败，拒绝写入");
  }
}
export class JsonCodec implements Codec {
  decode(raw: string): Decoded {
    if (hasMergeConflict(raw)) throw new StoreError("invalid_format", "笔记包含未解决的Git冲突块，请核对双方版本后手动处理；不会自动覆盖");
    try {
      const parsed: unknown = JSON.parse(raw);
      // Native JSON.parse drops duplicate keys. YAML's flow-map parser detects them.
      const checked = parseDocument(raw, { uniqueKeys: true, schema: "json", strict: true });
      if (checked.errors.length || checked.warnings.length) throw new Error("重复JSON键或格式错误");
      const attributes = dataObject(parsed);
      return { attributes: isEntity(attributes) ? internalFields(attributes) : attributes, body: "" };
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError("invalid_format", "记账JSON非法或存在重复键", undefined, error);
    }
  }
  create(attributes: Record<string, unknown>, body = ""): string {
    dataObject(attributes);
    if (body !== "") throw new StoreError("validation", "记账JSON行没有Markdown正文");
    const raw = `${JSON.stringify(isEntity(attributes) ? chineseFields(attributes) : attributes, null, 2)}\n`;
    if (!sameData(this.decode(raw).attributes, attributes)) throw new StoreError("invalid_format", "JSON往返校验失败");
    return raw;
  }
  update(_raw: string, attributes: Record<string, unknown>, body: string): string { return this.create(attributes, body); }
}
