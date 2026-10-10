import assert from "node:assert/strict";
import { test } from "node:test";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";

const built = await esbuild.build({ entryPoints: ["src/domain/index.ts"], bundle: true, platform: "browser", format: "esm", write: false, logLevel: "silent", plugins: [mobileDependencyGuard()] });
const d = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const id = "7184687e-9017-4db3-bc55-a0749d441ef2";
const other = "9184687e-9017-4db3-bc55-a0749d441ef2";
const third = "a184687e-9017-4db3-bc55-a0749d441ef2";
const now = "2026-10-09T14:00:00+08:00";
const later = "2026-10-10T14:00:00+08:00";
function sample(type, patch = {}) {
  const common = { biaoshi: id, shiti: type, jiegoubanben: 2, chuangjianshijian: now, gengxinshijian: now };
  const business = type === "riji" || type === "jizhang" ? { riqi: "2026-10-09" } : { mingcheng: "测试" };
  return d.deriveDateFields(d.normalizeInput({ ...common, ...business, ...(type === "jizhang" ? { fenlei: "餐饮", jine: 1250 } : {}), ...patch }));
}
function valid(input) { const result = d.validateRecord(input); assert.equal(result.ok, true, JSON.stringify(result)); return result; }
function invalid(input, field) { const result = d.validateRecord(input); assert.equal(result.ok, false); if (field) assert.ok(result.errors.some((issue) => issue.field === field), JSON.stringify(result)); }

test("all ten entity shapes validate with pinyin defaults", () => {
  assert.equal(d.shiti.length, 10);
  for (const type of d.shiti) {
    const value = sample(type);
    valid(value);
    assert.ok(Object.keys(value).every((key) => /^[a-z]+$/.test(key)));
  }
  assert.equal(sample("yuedu").zhuangtai, "weikaishi");
  assert.equal(sample("youxi").jindu, "weikaishi");
  assert.equal(sample("zhishi").jindu, "weikaishi");
});
test("templates missing identity are drafts; unknown type/version stay read only", () => {
  invalid({ shiti: "daiban", mingcheng: "测试", jiegoubanben: 2 }, "biaoshi");
  invalid({ ...sample("youxi"), jiegoubanben: 1 }, "jiegoubanben");
  invalid({ ...sample("youxi"), jiegoubanben: 3 }, "jiegoubanben");
  invalid({ ...sample("youxi"), shiti: "work" }, "shiti");
  invalid({ ...sample("youxi"), biaoshi: "7184687e-9017-1db3-bc55-a0749d441ef2" }, "biaoshi");
  invalid({ ...sample("youxi"), mingcheng: "{{title}}" }, "mingcheng");
});
test("exact decimal money conversion and formatting", () => {
  for (const [yuan, fen] of [["12.50", 1250], ["0.01", 1], ["0.29", 29], ["1.2", 120], ["00012.50", 1250], ["90071992547409.91", Number.MAX_SAFE_INTEGER]]) assert.equal(d.yuanToFen(yuan), fen);
  assert.equal(d.fenToYuan(1250), "12.50");
  assert.equal(d.fenToYuan(-1), "-0.01");
  assert.equal(d.fenToYuan(Number.MAX_SAFE_INTEGER), "90071992547409.91");
  for (const value of ["12.501", "0", "-1", "1e2", ".5", "NaN", "1.", "90071992547409.92", "1,000"]) assert.throws(() => d.yuanToFen(value));
});
test("ledger integer validation and totals reject overflow without partial results", () => {
  for (const jine of [0, -1, 12.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1250"]) invalid({ ...sample("jizhang"), jine }, "jine");
  invalid({ ...sample("jizhang"), shouzhi: "zhuanzhang" }, "shouzhi");
  assert.deepEqual(d.jizhangHuizong([{ shouzhi: "shouru", jine: 100 }, { shouzhi: "zhichu", jine: 1250 }, { shouzhi: "zhichu", jine: 500, yihuishou: true }]), { shouru: 100, zhichu: 1250, jieyu: -1150 });
  assert.throws(() => d.jizhangHuizong([{ shouzhi: "shouru", jine: Number.MAX_SAFE_INTEGER }, { shouzhi: "shouru", jine: 1 }]));
  invalid({ ...sample("jizhang"), yihuishou: true }, "huishoushijian");
  valid(sample("jizhang", { yihuishou: true, huishoushijian: now }));
});
test("real dates, leap years and explicit time offsets", () => {
  for (const value of ["2024-02-29", "2000-02-29", "0001-01-01"]) assert.equal(d.isRiqi(value), true);
  for (const value of ["2023-02-29", "1900-02-29", "2026-04-31", "2026-1-01", "0000-01-01"]) assert.equal(d.isRiqi(value), false);
  assert.equal(d.isShijian(now), true);
  assert.equal(d.isShijian("2026-10-09T06:00:00.123Z"), true);
  for (const value of ["2026-10-09T14:00:00", "2026-02-30T12:00:00Z", "2026-10-09T24:00:00Z", "2026-10-09T12:00:00+14:01"]) assert.equal(d.isShijian(value), false);
  invalid({ ...sample("youxi"), gengxinshijian: "2025-01-01T00:00:00Z" }, "gengxinshijian");
});
test("today and weekdays are independent of machine timezone", () => {
  assert.equal(d.jinri("2026-10-09T16:00:00Z"), "2026-10-10");
  assert.equal(d.jinri("2026-10-09T15:59:59Z"), "2026-10-09");
  assert.equal(d.jinri("2026-10-09T16:00:00Z", "America/New_York"), "2026-10-09");
  assert.equal(d.xingqi("2026-10-09"), "星期五");
  assert.equal(d.xingqi("2026-10-11"), "星期日");
});
test("Chinese calendar festivals and leap month match HKO reference dates", () => {
  assert.equal(d.nongli("2024-02-10"), "二〇二四年正月初一");
  assert.equal(d.nongli("2024-06-10"), "二〇二四年五月初五");
  assert.equal(d.nongli("2024-09-17"), "二〇二四年八月十五");
  assert.equal(d.nongli("2023-03-22"), "二〇二三年闰二月初一");
  assert.equal(d.nongli("2024-02-09"), "二〇二三年十二月三十");
  assert.ok(d.nongli("1901-01-01"));
  assert.ok(d.nongli("2100-12-31"));
  assert.throws(() => d.nongli("1900-12-31"), /1901/);
  assert.throws(() => d.nongli("2101-01-01"), /2100/);
});
test("missing Chinese calendar support reports unavailable", () => {
  const original = Intl.DateTimeFormat;
  Intl.DateTimeFormat = class { resolvedOptions() { return { calendar: "gregory" }; } };
  try { assert.throws(() => d.nongli("2024-02-10"), /不支持/); }
  finally { Intl.DateTimeFormat = original; }
});
test("diary content counts Unicode code points including spaces and newlines", () => {
  valid(sample("riji", { neirong: "😀".repeat(500) }));
  invalid(sample("riji", { neirong: "😀".repeat(501) }), "neirong");
  invalid(sample("riji", { neirong: "字".repeat(499) + " \n" }), "neirong");
  valid(sample("zhishi", { neirong: "字".repeat(501) }));
});
test("normalization is explicit, nonmutating and preserves unknown attributes", () => {
  const input = { ...sample("zhishi"), mingcheng: " 名称 ", neirong: "  内容\n ", biaoqian: [" A ", "A", ""], old_custom: { keep: true }, pingfen: null };
  const before = structuredClone(input);
  const output = d.normalizeInput(input);
  assert.deepEqual(input, before);
  assert.equal(output.mingcheng, "名称");
  assert.equal(output.neirong, "  内容\n ");
  assert.deepEqual(output.biaoqian, ["A"]);
  assert.deepEqual(output.old_custom, { keep: true });
  assert.equal(output.pingfen, null); // unknown on knowledge: not silently erased
  valid(output);
  valid({ ...sample("zhishi"), kaishiriqi: "2026-10-10", jiezhiriqi: "2026-10-09" }); // unknown fields are not knowledge date rules
  assert.equal(d.normalizeInput({ ...sample("yuedu"), pingfen: null }).pingfen, undefined);
  valid(sample("yuedu", { pingfen: 0, zishu: 0 }));
});
test("reading optional scores, integer counts, and movie enums validate", () => {
  for (const pingfen of [-1, 11, NaN, Infinity, "8"]) invalid(sample("yuedu", { pingfen }), "pingfen");
  invalid(sample("yuedu", { zishu: 0.1 }), "zishu");
  invalid(sample("yingshi", { leixing: "电影" }), "leixing");
  invalid(sample("yingshi", { daoyan: "导演" }), "daoyan");
  invalid(sample("yanchu", { didian: "场馆" }), "didian");
});
test("all date ranges reject reverse ordering including offset comparisons", () => {
  for (const type of ["daiban", "xiangmu"]) invalid(sample(type, { kaishiriqi: "2026-10-10", jiezhiriqi: "2026-10-09" }), "jiezhiriqi");
  invalid(sample("lvxing", { kaishiriqi: "2026-10-10", jieshuriqi: "2026-10-09" }), "jieshuriqi");
  const reading = d.fillCompletionFields(sample("yuedu", { zhuangtai: "yiwancheng", kaishishijian: "2026-10-09T09:00:00Z", duwanshijian: "2026-10-09T16:00:00+08:00" }), now);
  invalid(reading, "duwanshijian");
});
test("only applicable progress field and three pinyin values are accepted", () => {
  invalid(sample("youxi", { jindu: "进行中" }), "jindu");
  invalid(sample("yuedu", { jindu: "weikaishi" }), "zhuangtai");
  valid(sample("zhishi", { jindu: "weikaishi" }));
  invalid(sample("daiban", { yiquxiao: "false" }), "yiquxiao");
  invalid(sample("youxi", { wanchengshijian: now }), "wanchengshijian");
});
test("completion is idempotent; undo clears completion while preserving management flags", () => {
  const original = sample("daiban", { yiguidang: true, yiquxiao: true, quxiaoshijian: now, old_custom: 7 });
  const completed = d.changeProgress(original, "yiwancheng", later);
  assert.equal(completed.wanchengshijian, later);
  assert.equal(original.jindu, "weikaishi");
  const repeated = d.changeProgress(completed, "yiwancheng", "2026-10-11T14:00:00+08:00");
  assert.equal(repeated.wanchengshijian, later);
  assert.equal(repeated.gengxinshijian, later);
  const undone = d.undoCompletion(completed, "2026-10-11T14:00:00+08:00");
  assert.equal(undone.jindu, "weikaishi");
  assert.equal(undone.wanchengshijian, undefined);
  assert.equal(undone.yiquxiao, true);
  assert.equal(undone.old_custom, 7);
});
test("project reopen is in progress and clears cancellation and archive", () => {
  const project = d.fillCompletionFields(sample("xiangmu", { jindu: "yiwancheng", yiquxiao: true, quxiaoshijian: now, yiguidang: true }), now);
  const reopened = d.undoCompletion(project, later);
  valid(reopened);
  assert.equal(reopened.jindu, "jinxingzhong");
  assert.equal(reopened.yiquxiao, false);
  assert.equal(reopened.yiguidang, false);
  assert.equal(reopened.quxiaoshijian, undefined);
  assert.equal(reopened.wanchengshijian, undefined);
});
test("reading historical completion is preserved, synchronized and cleared on undo", () => {
  const historical = "2026-10-08T12:00:00+08:00";
  const reading = d.fillCompletionFields(sample("yuedu", { zhuangtai: "yiwancheng", duwanshijian: historical }), now);
  valid(reading);
  assert.equal(reading.wanchengshijian, historical);
  assert.equal(d.changeProgress(reading, "yiwancheng", later).duwanshijian, historical);
  const undone = d.undoCompletion(reading, later);
  assert.equal(undone.duwanshijian, undefined);
  assert.equal(undone.wanchengshijian, undefined);
  assert.equal(d.changeProgress(undone, "yiwancheng", later).duwanshijian, later);
});
test("watching one episode does not auto-complete movies; action time does not replace event time", () => {
  const movie = sample("yingshi", { guankanshijian: now });
  assert.equal(movie.jindu, "weikaishi");
  assert.equal(d.changeProgress(movie, "yiwancheng", later).guankanshijian, now);
  assert.equal(d.changeProgress(sample("yanchu", { shijian: now }), "yiwancheng", later).shijian, now);
});
test("relations reject self and duplicates while retaining missing targets", () => {
  invalid(sample("riji", { guanlian: [id.toUpperCase()] }), "guanlian");
  invalid({ ...sample("daiban"), guanlian: [other, other.toUpperCase()] }, "guanlian");
  const record = sample("daiban", { guanlian: [other] });
  const result = d.validateRecord(record, { targets: new Map() });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(record.guanlian, [other]);
});
test("task has one project; new links to closed projects fail; existing links survive", () => {
  const p1 = sample("xiangmu", { biaoshi: other });
  const p2 = sample("xiangmu", { biaoshi: third, yiguidang: true });
  const targets = new Map([[other, p1], [third, p2]]);
  assert.equal(d.validateRecord(sample("daiban", { guanlian: [other, third] }), { targets }).ok, false);
  assert.equal(d.validateRecord(sample("daiban", { guanlian: [third] }), { targets }).ok, false);
  assert.equal(d.validateRecord(sample("daiban", { guanlian: [third] }), { targets, previous: [third] }).ok, true);
  const closed = d.fillCompletionFields(sample("xiangmu", { biaoshi: other, jindu: "yiwancheng" }), now);
  assert.equal(d.validateRecord(sample("daiban", { guanlian: [other] }), { targets: new Map([[other, closed]]) }).ok, false);
});
test("attachment paths stay relative; homepage progress excludes cancel/archive", () => {
  valid(sample("xiangmu", { shangchuanwenjian: ["90_附件/项目/文档.pdf"] }));
  for (const path of ["../secret", "/root/a", "C:/a", "a\\b", "a/./b", "a//b", "a/../b"]) invalid(sample("xiangmu", { shangchuanwenjian: [path] }), "shangchuanwenjian");
  assert.equal(d.isInProgress(sample("youxi", { jindu: "jinxingzhong" })), true);
  assert.equal(d.isInProgress(sample("yuedu", { zhuangtai: "jinxingzhong" })), true);
  assert.equal(d.isInProgress(sample("youxi", { jindu: "jinxingzhong", yiguidang: true })), false);
  assert.equal(d.isInProgress(sample("daiban", { jindu: "jinxingzhong", yiquxiao: true, quxiaoshijian: now })), false);
  assert.equal(d.isInProgress(sample("riji")), false);
});
test("validation does not silently fix old derived fields or mutate raw input", () => {
  const record = { ...sample("riji"), xingqi: "星期一", nongli: "旧值", custom: ["保留"] };
  const before = structuredClone(record);
  invalid(record, "xingqi");
  invalid(record, "nongli");
  assert.deepEqual(record, before);
  const fixed = d.deriveDateFields(record);
  valid(fixed);
  assert.deepEqual(record, before);
  assert.deepEqual(fixed.custom, ["保留"]);
});
