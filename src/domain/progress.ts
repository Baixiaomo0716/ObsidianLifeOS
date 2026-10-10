import { jindu, jinduZiduan, type Jilu, type Jindu } from "./entities";
import { isShijian } from "./date";
import { validateRecord } from "./validation";
// Explicit save preparation also supports a historical reading completion date.
export function fillCompletionFields(input: Record<string, unknown>, now: string): Record<string, unknown> {
  if (!isShijian(now)) throw new Error("操作时间需要有效时区偏移");
  const output = { ...input };
  if (output.shiti === "yuedu" && output.zhuangtai === "yiwancheng") {
    output.duwanshijian = output.duwanshijian ?? now;
    output.wanchengshijian = output.duwanshijian;
  } else if (output.jindu === "yiwancheng") output.wanchengshijian = output.wanchengshijian ?? now;
  return output;
}
export function changeProgress(record: Jilu, next: Jindu, now: string): Jilu {
  if (!validateRecord(record).ok) throw new Error("原记录校验失败，不允许切换进度");
  if (!isShijian(now) || Date.parse(now) < Date.parse(record.gengxinshijian)) throw new Error("操作时间无效或早于上次更新");
  const field = jinduZiduan(record.shiti);
  if (!field || !jindu.includes(next)) throw new Error("此实体不支持该进度");
  const output: Record<string, unknown> = { ...record, [field]: next };
  if (next === "yiwancheng") {
    if (record.shiti === "yuedu") {
      output.duwanshijian = record.duwanshijian ?? now;
      output.wanchengshijian = output.duwanshijian;
    } else output.wanchengshijian = output.wanchengshijian ?? now;
  } else {
    delete output.wanchengshijian;
    if (record.shiti === "yuedu") delete output.duwanshijian;
  }
  if (record[field] !== next) output.gengxinshijian = now;
  if (!validateRecord(output).ok) throw new Error("切换后记录无效，请检查日期顺序");
  return output as Jilu;
}
export function undoCompletion(record: Jilu, now: string): Jilu {
  if (record.shiti === "xiangmu") {
    const output = changeProgress(record, "jinxingzhong", now);
    output.yiquxiao = false;
    output.yiguidang = false;
    delete output.quxiaoshijian;
    return output;
  }
  return changeProgress(record, "weikaishi", now);
}
export function isInProgress(record: Jilu): boolean {
  const field = jinduZiduan(record.shiti);
  return !!field && record[field] === "jinxingzhong" && !record.yiquxiao && !record.yiguidang;
}
