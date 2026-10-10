import type { Vault } from "obsidian";
import { ObsidianFileSystem } from "../adapters/obsidian/file-system";
import { BrowserIds, BrowserDeviceIdentity, BrowserFingerprint } from "../adapters/browser/identity";
import { NoteStore, LedgerStore } from "../storage/entity-store";
import { StorageLayout } from "../storage/paths";
import { OperationService } from "./operation-service";
import { ConflictHandler } from "./conflict-handler";
import { StoreError } from "../domain/errors";
import { EntityIndex } from "./entity-index";
import { IntegrityCheck } from "./integrity-check";
import { TrashStore } from "./trash-store";

// Explicit command only: each run creates an isolated synthetic-data directory.
export async function runHostCheck(vault: Vault, active: () => boolean): Promise<string> {
  const ids = new BrowserIds(), run = ids.next();
  const layout = new StorageLayout(`LifeOS验收/${run}`);
  const files = new ObsidianFileSystem(vault, active);
  const clock = { now: (): string => new Date().toISOString() };
  const notes = new NoteStore(files, layout, clock), ledger = new LedgerStore(files, layout, clock);
  const operations = new OperationService(files, layout, notes, ledger, clock, ids, new BrowserDeviceIdentity(ids), new BrowserFingerprint());
  const results: string[] = [];
  const assert = (condition: boolean, message: string): void => { if (!condition) throw new Error(message); };
  try {
    const time = clock.now(), noteId = ids.next(), ledgerId = ids.next();
    const common = { jiegoubanben: 2 as const, chuangjianshijian: time, gengxinshijian: time };
    const notePath = `${layout.module("zhishi")}/验收笔记.md`;
    const body = "\n# 合成验收数据\n- [ ] 保留 checkbox\n[[验收双链]]\n中文与表情 🐾\n";
    const request = { caozuobiaoshi: ids.next(), buzhou: [{ caozuoleixing: "chuangjian" as const, lujing: notePath,
      jilu: { ...common, biaoshi: noteId, shiti: "zhishi" as const, mingcheng: "宿主验收", biaoqian: [], neirong: "测试", legacy_extra: { value: "未知属性保留" } }, zhengwen: body }] };
    await operations.run(request);
    const base = await notes.read(notePath);
    assert(base.validation.ok && base.body === body, "笔记重读或正文不一致");
    results.push("通过：MD创建、重读与正文保护");
    await operations.run(request);
    assert((await notes.read(notePath)).version.original === base.version.original, "重复提交改变原文");
    results.push("通过：同操作重复提交不重复写入");
    const rowPath = layout.ledgerPath(ledgerId);
    await operations.run({ caozuobiaoshi: ids.next(), buzhou: [{ caozuoleixing: "chuangjian", lujing: rowPath,
      jilu: { ...common, biaoshi: ledgerId, shiti: "jizhang", riqi: "2026-10-09", xingqi: "星期五", shouzhi: "zhichu", fenlei: "验收", biaoqian: [], jine: 1250 } }] });
    assert((await ledger.read(rowPath)).attributes.jine === 1250, "记账金额不一致");
    results.push("通过：独立JSON记账行重读，1250分");
    const other = await notes.update(base.version, { set: { neirong: "另一处修改" } });
    assert(other.body === body && JSON.stringify(other.attributes.legacy_extra) === JSON.stringify(base.attributes.legacy_extra), "正文或未知属性丢失");
    results.push("通过：公开Vault.process更新保留正文与未知属性");
    let conflict = false;
    try { await notes.update(base.version, { set: { neirong: "我的修改" } }); }
    catch (error) { if (error instanceof StoreError && error.code === "conflict") conflict = true; else throw error; }
    assert(conflict, "旧版本没有被拒绝");
    const handler = new ConflictHandler(files, layout, operations);
    const copyRequest = await handler.capture(base.version, { set: { neirong: "我的修改" } });
    const copyId = ids.next(), receipt = await handler.saveCopy(copyId, copyRequest);
    await handler.saveCopy(copyId, copyRequest);
    assert((await notes.read(notePath)).version.original === other.version.original, "副本操作改变源文件");
    assert((await files.read(receipt.buzhou[0]!.lujing)).includes("我的修改"), "副本内容缺失");
    results.push("通过：旧版本冲突暂停、独立副本、重复副本请求与源文件保护");
    const restarted = new OperationService(files, layout, notes, ledger, clock, ids, new BrowserDeviceIdentity(ids), new BrowserFingerprint());
    await restarted.resume(request.caozuobiaoshi);
    assert((await notes.read(notePath)).version.original === other.version.original, "已完成操作重放覆盖后续修改");
    results.push("通过：重新实例化服务读取磁盘日志，已完成回执不重放");
    const index = new EntityIndex(files, layout), trash = new TrashStore(index, clock);
    assert((await new IntegrityCheck(index, files).run()).length === 0 && index.all().length === 2, "隔离样本索引或完整性检查不一致");
    results.push("通过：双源索引与完整性检查，冲突副本不计入");
    for (const [store, path] of [[notes, notePath], [ledger, rowPath]] as const) {
      const before = await store.read(path);
      await operations.run({ caozuobiaoshi: ids.next(), buzhou: [await trash.prepare(before, true)] });
      await index.rebuild(); assert(index.all().length === 1, "回收记录仍被统计");
      const recycled = await store.read(path);
      await operations.run({ caozuobiaoshi: ids.next(), buzhou: [await trash.prepare(recycled, false)] });
      await index.rebuild(); const after = await store.read(path);
      assert(index.all().length === 2 && after.attributes.biaoshi === before.attributes.biaoshi && after.body === before.body, "恢复身份、正文或索引不一致");
    }
    results.push("通过：MD与JSON回收恢复保留身份和正文，索引计数恢复");
  } catch (error) {
    results.push(`失败（后续步骤未执行）：${error instanceof Error ? error.message : String(error)}`);
  }
  const reportPath = `${layout.root}/验收报告.md`;
  await files.create(reportPath, `# DEV-008 宿主自动检查\n\n时间：${clock.now()}\n\n运行标识：${run}\n\n${results.map((line) => `- ${line}`).join("\n")}\n\n请补填设备、系统和Obsidian版本。以上只检查当前宿主；实际进程重启、视图布局、手机和Git同步、独立备份恢复未验证。测试数据均为合成数据，请保留供核对。\n`);
  return reportPath;
}
