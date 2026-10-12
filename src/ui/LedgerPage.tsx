import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../ports/entity-store";
import type { LedgerTableService, LedgerQuery } from "../services/ledger-table-service";
import type { LedgerService, LedgerDraft } from "../services/ledger-service";
import { fenToYuan } from "../domain/money";
import { LedgerForm } from "./LedgerForm";
export interface LedgerPort { table: LedgerTableService; entry: LedgerService; create: () => void; active: () => boolean; download: (format: "csv" | "json", text: string) => void }
function Recycle({ source, port }: { source: Snapshot; port: LedgerPort }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), draft = useRef<LedgerDraft | null>(null), saving = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async () => {
    if (saving.current || !port.active()) return; saving.current = true; setBusy(true);
    try { draft.current ??= await port.table.prepareRecycle(source, source.attributes.yihuishou !== true); await port.table.execute(draft.current); }
    catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  return <div><button type="button" disabled={busy} onClick={() => { void run(); }}>{draft.current && message ? "重试同一操作" : source.attributes.yihuishou ? "恢复" : "回收"}</button><p role="status">{message}</p></div>;
}
export function LedgerPage({ port }: { port: LedgerPort }) {
  const [query, setQuery] = useState<LedgerQuery>({}), [editing, setEditing] = useState<Snapshot | null>(null), [message, setMessage] = useState(""), [, refresh] = useState(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; const release = port.table.subscribe(() => refresh((n) => n + 1)); return () => { mounted.current = false; release(); }; }, [port.table]);
  const result = port.table.query(query), change = (patch: LedgerQuery) => setQuery({ ...query, ...patch, page: 1 });
  const download = (format: "csv" | "json") => { try { port.download(format, port.table.export(query, format)); setMessage("已导出全部筛选结果，包含所有分页。"); } catch (error) { setMessage(String(error)); } };
  return <section aria-label="记账数据表"><div className="lifeos-query-fields"><label>从<input type="date" value={query.from ?? ""} onChange={(e) => change({ from: e.target.value })} /></label><label>至<input type="date" value={query.to ?? ""} onChange={(e) => change({ to: e.target.value })} /></label><label>收支<select value={query.kind ?? ""} onChange={(e) => change({ kind: e.target.value })}><option value="">全部收支</option><option value="shouru">收入</option><option value="zhichu">支出</option></select></label><label>分类<input value={query.category ?? ""} onChange={(e) => change({ category: e.target.value })} /></label><label>标签<input value={query.tag ?? ""} onChange={(e) => change({ tag: e.target.value })} /></label><label>搜索<input value={query.text ?? ""} onChange={(e) => change({ text: e.target.value })} /></label><label><input type="checkbox" checked={query.recycled === true} onChange={(e) => change({ recycled: e.target.checked })} />查看回收记录</label></div>
    <div className="lifeos-template-actions"><button type="button" onClick={port.create}>新建记账</button><button type="button" disabled={!result.ready || !!result.error} onClick={() => download("csv")}>导出CSV</button><button type="button" disabled={!result.ready || !!result.error} onClick={() => download("json")}>导出原始JSON</button></div>
    {!result.ready ? <p>正在读取账本…</p> : <><p role="status">共 {result.total} 条；{result.issues} 项索引问题。</p>{result.error ? <p role="alert">{result.error}</p> : result.totals && <p>筛选结果：收入 ¥{fenToYuan(result.totals.shouru)} · 支出 ¥{fenToYuan(result.totals.zhichu)} · 结余 ¥{fenToYuan(result.totals.jieyu)}（回收行不计入）</p>}<div className="lifeos-relation-results" role="region" aria-label="账本行" tabIndex={0}><table><thead><tr>{["日期", "星期", "收支", "分类", "标签", "金额（元）", "操作"].map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{result.items.map((row) => { const a = row.attributes; return <tr key={String(a.biaoshi)}><td>{String(a.riqi)}</td><td>{String(a.xingqi)}</td><td>{a.shouzhi === "shouru" ? "收入" : "支出"}</td><td>{String(a.fenlei)}</td><td>{(a.biaoqian as string[]).join("、")}</td><td>¥{fenToYuan(a.jine as number)}</td><td>{!a.yihuishou && <button type="button" onClick={() => setEditing(row)}>编辑</button>}<Recycle key={row.version.original} source={row} port={port} /></td></tr>; })}</tbody></table>{!result.total && <p>暂无符合条件的记账行。</p>}</div><div className="lifeos-filter-bar"><button type="button" disabled={result.page <= 1} onClick={() => setQuery({ ...query, page: result.page - 1 })}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={result.page >= result.pages} onClick={() => setQuery({ ...query, page: result.page + 1 })}>下一页</button></div></>}
    <p role="status">{message}</p>{editing && <LedgerForm key={editing.version.original} service={{ today: () => port.entry.today(), categories: (kind) => port.entry.categories(kind), prepare: (input) => port.table.prepareEdit(editing, input), execute: (draft) => port.table.execute(draft) }} initial={{ date: String(editing.attributes.riqi), kind: editing.attributes.shouzhi as "shouru" | "zhichu", category: String(editing.attributes.fenlei), amount: fenToYuan(editing.attributes.jine as number), tags: editing.attributes.biaoqian as string[] }} active={() => mounted.current && port.active()} close={() => setEditing(null)} saved={() => { if (mounted.current) { setEditing(null); setMessage("记账修改已保存。"); } }} />}
  </section>;
}
