import { jindu, jinduZiduan, shiti, type Jilu, type Shiti } from "./entities";
import { isRiqi, isShijian, nongli, xingqi } from "./date";

export const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Rule = "text" | "requiredText" | "list" | "ids" | "date" | "time" | "score" | "integer" | "paths";
const fields: Record<Shiti, Record<string, Rule>> = {
  riji: { riqi: "date", tianqi: "text", xingqi: "requiredText", nongli: "requiredText", guanlian: "ids", neirong: "text", biaoqian: "list" },
  jizhang: { riqi: "date", xingqi: "requiredText", fenlei: "requiredText", biaoqian: "list" },
  yuedu: { mingcheng: "requiredText", zuozhe: "text", laiyuan: "text", leixing: "text", biaoqian: "list", zishu: "integer", jianjie: "text", pingjia: "text", pingfen: "score", kaishishijian: "time", duwanshijian: "time" },
  yingshi: { mingcheng: "requiredText", leixing: "text", daoyan: "list", zhuyan: "list", shangyingshijian: "date", guankanshijian: "time", jianjie: "text", pingjia: "text", doubanpingfen: "score" },
  youxi: { mingcheng: "requiredText", leixing: "text", jianjie: "text", faxingshijian: "date", pingjia: "text" },
  yanchu: { mingcheng: "requiredText", leixing: "text", yueduimingcheng: "list", shijian: "time", didian: "list", jianjie: "text", pingjia: "text", pingfen: "score" },
  lvxing: { mingcheng: "requiredText", kaishiriqi: "date", jieshuriqi: "date", didian: "list", jiaotonggongju: "list", zhusu: "list", pingjia: "text" },
  zhishi: { mingcheng: "requiredText", biaoqian: "list", neirong: "text" },
  daiban: { mingcheng: "requiredText", kaishiriqi: "date", jiezhiriqi: "date", guanlian: "ids", neirong: "text", biaoqian: "list" },
  xiangmu: { mingcheng: "requiredText", kaishiriqi: "date", jiezhiriqi: "date", neirong: "text", daiban: "ids", shangchuanwenjian: "paths" },
};
for (const type of shiti) fields[type].biaoqian ??= "list";
export function editableFields(type: Shiti): readonly string[] {
  const progress = jinduZiduan(type);
  return [...Object.keys(fields[type]), ...(progress ? [progress, "wanchengshijian", "yiquxiao", "quxiaoshijian", "yiguidang"] : []),
    ...(type === "jizhang" ? ["shouzhi", "jine"] : []), "yihuishou", "huishoushijian"];
}
export interface Issue { field: string; message: string }
export type Validation = { ok: true; value: Jilu; warnings: Issue[] } | { ok: false; errors: Issue[]; warnings: Issue[] };
export interface RelationContext {
  targets: ReadonlyMap<string, Jilu>;
  previous?: readonly string[];
}
export function isRelativePath(path: string): boolean {
  return !!path.trim() && !path.includes("\\") && !/[\u0000-\u001f]/.test(path)
    && !/^[\/]|^[a-z][a-z\d+.-]*:/i.test(path)
    && path.split("/").every((part) => part !== ".." && part !== "." && part !== "");
}
function blank(value: unknown): boolean { return value === undefined || value === null || value === ""; }
// Called explicitly when preparing input, never as a side effect of reading a file.
export function normalizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const output = { ...input };
  if (!shiti.includes(input.shiti as Shiti)) return output;
  const type = input.shiti as Shiti;
  for (const [field, rule] of Object.entries(fields[type])) {
    const value = input[field];
    if (["list", "ids", "paths"].includes(rule)) {
      if (blank(value)) output[field] = [];
      else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        output[field] = [...new Set(value.map((item: string) => item.trim()).filter(Boolean).map((item: string) => rule === "ids" ? item.toLowerCase() : item))];
      }
    } else if (blank(value)) delete output[field];
    else if (rule === "requiredText" && typeof value === "string") output[field] = value.trim();
  }
  const progress = jinduZiduan(type);
  if (progress) {
    if (blank(output[progress])) output[progress] = "weikaishi";
    if (blank(output.yiquxiao)) output.yiquxiao = false;
    if (blank(output.yiguidang)) output.yiguidang = false;
    for (const field of ["wanchengshijian", "quxiaoshijian"]) if (blank(output[field])) delete output[field];
  }
  if (type === "jizhang") {
    if (blank(output.shouzhi)) output.shouzhi = "zhichu";
    if (blank(output.yihuishou)) output.yihuishou = false;
    if (blank(output.huishoushijian)) delete output.huishoushijian;
  }
  return output;
}
export function deriveDateFields(input: Record<string, unknown>): Record<string, unknown> {
  if (input.shiti !== "riji" && input.shiti !== "jizhang") return { ...input };
  if (!isRiqi(input.riqi)) throw new Error("日期无效");
  return { ...input, xingqi: xingqi(input.riqi), ...(input.shiti === "riji" ? { nongli: nongli(input.riqi) } : {}) };
}
export function validateRecord(input: unknown, context?: RelationContext): Validation {
  const errors: Issue[] = [], warnings: Issue[] = [];
  const fail = (field: string, message: string): void => { errors.push({ field, message }); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: [{ field: "", message: "记录必须是对象" }], warnings };
  const data = input as Record<string, unknown>;
  if (!shiti.includes(data.shiti as Shiti)) return { ok: false, errors: [{ field: "shiti", message: "实体类型未知，只读" }], warnings };
  const type = data.shiti as Shiti;
  if (data.jiegoubanben !== 2) fail("jiegoubanben", "仅支持结构版本2，其他版本只读");
  if (typeof data.biaoshi !== "string" || !uuidV4.test(data.biaoshi)) fail("biaoshi", "需要UUID v4标识");
  for (const field of ["chuangjianshijian", "gengxinshijian"]) if (!isShijian(data[field])) fail(field, "需要带偏移的有效ISO时间");
  if (isShijian(data.chuangjianshijian) && isShijian(data.gengxinshijian) && Date.parse(data.gengxinshijian) < Date.parse(data.chuangjianshijian)) fail("gengxinshijian", "更新不能早于创建");
  for (const [field, rule] of Object.entries(fields[type])) {
    const value = data[field];
    const required = rule === "requiredText" || ((type === "riji" || type === "jizhang") && field === "riqi") || ["ids", "paths", "list"].includes(rule) && !(type === "yanchu" && field === "didian") && !(field === "biaoqian" && !["jizhang", "yuedu", "zhishi"].includes(type));
    if (value === undefined || value === null && !required) { if (required) fail(field, "字段必填"); continue; }
    if (rule === "text" || rule === "requiredText") {
      if (typeof value !== "string" || (rule === "requiredText" && (!value.trim() || value === "{{title}}"))) fail(field, "需要有效文本");
    } else if (["list", "ids", "paths"].includes(rule)) {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && !!item.trim())) fail(field, "需要非空字符串列表");
      else {
        const canonical = value.map((item: string) => rule === "ids" ? item.toLowerCase() : item);
        if (new Set(canonical).size !== value.length) fail(field, "列表不能重复");
        if (rule === "ids" && value.some((item: string) => !uuidV4.test(item))) fail(field, "关联需要UUID v4");
        if (field === "guanlian" && canonical.includes(String(data.biaoshi).toLowerCase())) fail(field, "不能关联自身");
        if (rule === "paths" && value.some((item: string) => !isRelativePath(item))) fail(field, "附件须为Vault相对路径");
      }
    } else if (rule === "date" && !isRiqi(value)) fail(field, "需要真实YYYY-MM-DD日期");
    else if (rule === "time" && !isShijian(value)) fail(field, "需要带偏移的有效ISO时间");
    else if (rule === "score" && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10)) fail(field, "评分范围0–10");
    else if (rule === "integer" && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) fail(field, "需要非负安全整数");
  }
  if (type === "riji" && typeof data.neirong === "string" && Array.from(data.neirong).length > 500) fail("neirong", "日记内容最多500个Unicode码点");
  if ((type === "riji" || type === "jizhang") && isRiqi(data.riqi)) {
    if (data.xingqi !== xingqi(data.riqi)) fail("xingqi", "星期与日期不一致，需显式修正");
    if (type === "riji") {
      try { if (data.nongli !== nongli(data.riqi)) fail("nongli", "农历与日期不一致，需显式修正"); }
      catch (error) { fail("nongli", error instanceof Error ? error.message : "农历不可用"); }
    }
  }
  if (type === "jizhang") {
    if (data.shouzhi !== "shouru" && data.shouzhi !== "zhichu") fail("shouzhi", "仅支持收入或支出");
    if (typeof data.jine !== "number" || !Number.isSafeInteger(data.jine) || data.jine <= 0) fail("jine", "金额须为正安全整数分");
  }
  if (data.yihuishou !== undefined && typeof data.yihuishou !== "boolean") fail("yihuishou", "需要布尔值");
  if (data.huishoushijian !== undefined && (!isShijian(data.huishoushijian) || data.yihuishou !== true)) fail("huishoushijian", "回收时间仅用于回收记录");
  if (data.yihuishou === true && !isShijian(data.huishoushijian)) fail("huishoushijian", "回收记录需要时间");
  if (type === "yingshi" && data.leixing != null && !["dianying", "dianshiju", "jilupian", "donghua", "zongyi", "qita"].includes(String(data.leixing))) fail("leixing", "影视类型未知");
  const progress = jinduZiduan(type);
  if (progress) {
    if (!(type === "zhishi" && data[progress] === undefined && data.shuxingmoshi !== "tongyi") && !jindu.includes(data[progress] as typeof jindu[number])) fail(progress, "进度列表仅填写未开始、进行中、已完成中的一项");
    if (data[progress === "jindu" ? "zhuangtai" : "jindu"] !== undefined) fail(progress, "不能同时使用两种进度字段");
    for (const field of ["yiquxiao", "yiguidang"]) if (data[field] !== undefined && typeof data[field] !== "boolean") fail(field, "需要布尔值");
    if (data.quxiaoshijian !== undefined && (!isShijian(data.quxiaoshijian) || data.yiquxiao !== true)) fail("quxiaoshijian", "取消时间仅用于取消记录");
    if (data.yiquxiao === true && !isShijian(data.quxiaoshijian)) fail("quxiaoshijian", "取消记录需要时间");
    if (data[progress] === "yiwancheng" && !isShijian(data.wanchengshijian)) fail("wanchengshijian", "完成记录需要有效完成时间");
    if (data[progress] !== "yiwancheng" && data.wanchengshijian !== undefined) fail("wanchengshijian", "未完成时应清除完成时间");
    if (type === "yuedu") {
      if (data.zhuangtai === "yiwancheng" && !isShijian(data.duwanshijian)) fail("duwanshijian", "已完成阅读需要读完时间");
      if (data.duwanshijian != null && data.zhuangtai !== "yiwancheng") fail("duwanshijian", "存在读完时间要求已完成");
      if (isShijian(data.duwanshijian) && isShijian(data.wanchengshijian) && Date.parse(data.duwanshijian) !== Date.parse(data.wanchengshijian)) fail("wanchengshijian", "阅读完成时间须与读完时间一致");
    }
  } else for (const field of ["jindu", "zhuangtai", "wanchengshijian", "yiquxiao", "quxiaoshijian", "yiguidang"]) if (data[field] !== undefined) fail(field, "此实体不使用进度管理字段");
  for (const [start, end] of [["kaishiriqi", "jieshuriqi"], ["kaishiriqi", "jiezhiriqi"], ["kaishishijian", "duwanshijian"]]) {
    if (!start || !end || !fields[type][start] || !fields[type][end]) continue;
    const a = data[start], b = data[end];
    if (start.endsWith("riqi") ? isRiqi(a) && isRiqi(b) && a > b : isShijian(a) && isShijian(b) && Date.parse(a) > Date.parse(b)) fail(end, "结束不能早于开始");
  }
  if (!context && Array.isArray(data.guanlian) && data.guanlian.length) warnings.push({ field: "guanlian", message: "目标关系尚未检查，需要实体索引确认项目归属及缺失目标" });
  if (context && Array.isArray(data.guanlian)) {
    const projects = new Set<string>();
    const previous = new Set((context.previous ?? []).map((id) => id.toLowerCase()));
    for (const id of data.guanlian) {
      if (typeof id !== "string") continue;
      const target = context.targets.get(id.toLowerCase());
      if (!target) { warnings.push({ field: "guanlian", message: `关联目标缺失：${id}` }); continue; }
      if (type === "daiban" && target.shiti === "xiangmu") {
        projects.add(target.biaoshi.toLowerCase());
        if (!previous.has(id.toLowerCase()) && (target.jindu === "yiwancheng" || target.yiquxiao || target.yiguidang)) fail("guanlian", "不能新增归属到已关闭、取消或归档项目");
      }
    }
    if (projects.size > 1) fail("guanlian", "待办最多归属一个项目");
  }
  const value = { ...data };
  for (const [field, rule] of Object.entries(fields[type])) if (value[field] === null && !["requiredText", "list", "ids", "paths"].includes(rule)) delete value[field];
  return errors.length ? { ok: false, errors, warnings } : { ok: true, value: value as Jilu, warnings };
}
