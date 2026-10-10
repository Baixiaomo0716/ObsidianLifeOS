import { StoreError } from "../domain/errors";
import { hasOwn } from "./data-values";
export const fieldNames: Readonly<Record<string, string>> = {
  biaoshi: "标识", shiti: "实体", jiegoubanben: "结构版本", chuangjianshijian: "创建时间", gengxinshijian: "更新时间",
  riqi: "日期", xingqi: "星期", nongli: "农历", tianqi: "天气", guanlian: "关联", neirong: "内容", biaoqian: "标签",
  mingcheng: "名称", zuozhe: "作者", laiyuan: "来源", leixing: "类型", zishu: "字数", zhuangtai: "状态", jianjie: "简介",
  pingjia: "评价", pingfen: "评分", kaishishijian: "开始时间", duwanshijian: "读完时间", daoyan: "导演", zhuyan: "主演",
  shangyingshijian: "上映时间", guankanshijian: "观看时间", doubanpingfen: "豆瓣评分", jindu: "进度", faxingshijian: "发行时间",
  yueduimingcheng: "乐队名称", shijian: "时间", didian: "地点", kaishiriqi: "开始日期", jieshuriqi: "结束日期", jiezhiriqi: "截止日期",
  jiaotonggongju: "交通工具", zhusu: "住宿", daiban: "待办", shangchuanwenjian: "上传文件", shouzhi: "收支", fenlei: "分类", jine: "金额",
  wanchengshijian: "完成时间", yiquxiao: "已取消", quxiaoshijian: "取消时间", yiguidang: "已归档", yihuishou: "已回收", huishoushijian: "回收时间",
  shuxingmoshi: "属性模式", bijishiqu: "笔记时区",
};
const types: Record<string, string> = { riji: "日记", jizhang: "记账", yuedu: "阅读", yingshi: "影视", youxi: "游戏", yanchu: "演出", lvxing: "旅行", zhishi: "知识", daiban: "待办", xiangmu: "项目" };
const progress: Record<string, string> = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
const values: Record<string, Record<string, string>> = { shiti: types, jindu: progress, zhuangtai: progress,
  shouzhi: { shouru: "收入", zhichu: "支出" }, shuxingmoshi: { jianjie: "简洁", tongyi: "统一" } };
const movieTypes: Record<string, string> = { dianying: "电影", dianshiju: "电视剧", jilupian: "纪录片", donghua: "动画", zongyi: "综艺", qita: "其他" };
export function internalFields(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const reverse = Object.fromEntries(Object.entries(fieldNames).map(([key, value]) => [value, key]));
  for (const [field, value] of Object.entries(input)) {
    const key = reverse[field] ?? field;
    if (hasOwn(output, key)) throw new StoreError("invalid_format", `中英文属性重复：${fieldNames[key] ?? key}，请保留原文件并处理冲突`);
    output[key] = value;
  }
  for (const [key, labels] of Object.entries(values)) for (const [value, label] of Object.entries(labels)) if (output[key] === label) output[key] = value;
  if (output.shiti === "yingshi") for (const [value, label] of Object.entries(movieTypes)) if (output.leixing === label) output.leixing = value;
  if (output.jiegoubanben === 3) output.jiegoubanben = 2;
  return output;
}
export function chineseFields(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const field = fieldNames[key] ?? key;
    if (hasOwn(output, field)) throw new StoreError("invalid_format", `属性名冲突：${field}`);
    const labels = key === "leixing" && input.shiti === "yingshi" ? movieTypes : values[key];
    output[field] = key === "jiegoubanben" && value === 2 ? 3 : typeof value === "string" && labels ? labels[value] ?? value : value;
  }
  return output;
}
export function isEntity(input: Record<string, unknown>): boolean { return hasOwn(input, "shiti") || hasOwn(input, "实体"); }
