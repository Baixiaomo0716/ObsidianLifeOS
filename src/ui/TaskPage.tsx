import { useEffect, useRef, useState } from "react";
import type { TaskListService, TaskGroup, TaskRow } from "../services/task-list-service";
import type { TaskService, TaskDraft } from "../services/task-service";
export interface TaskPort { list: TaskListService; service: TaskService; create: () => void; open: (id: string) => void; progress: (id: string) => void; relations: (id: string) => void }
const names = { shoujixiang: "收集箱", jintian: "今天", yuqi: "逾期", quanbu: "全部" }, progressNames: Record<string, string> = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
function Dates({ row, service, close }: { row: TaskRow; service: TaskService; close: () => void }) {
  const [start, setStart] = useState(String(row.source.attributes.kaishiriqi ?? "")), [end, setEnd] = useState(String(row.source.attributes.jiezhiriqi ?? "")), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [draft, setDraft] = useState<TaskDraft | null>(null);
  const saving = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = async () => {
    if (saving.current) return; saving.current = true; setBusy(true);
    try { const request = draft ?? await service.prepareDates(row.source, start, end); if (mounted.current) setDraft(request); await service.execute(request); if (mounted.current) close(); }
    catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  return <section aria-label="待办日期编辑"><h3>{row.title} · 日期</h3><label>开始日期<input type="date" value={start} disabled={busy || !!draft} onChange={(e) => setStart(e.target.value)} /></label><label>截止日期<input type="date" value={end} disabled={busy || !!draft} onChange={(e) => setEnd(e.target.value)} /></label><p role="status">{message}</p><div className="lifeos-template-actions"><button type="button" disabled={busy} onClick={close}>取消编辑</button><button type="button" disabled={busy} onClick={() => { void save(); }}>{draft ? "重试日期保存" : "保存日期"}</button></div></section>;
}
export function TaskPage({ port }: { port: TaskPort }) {
  const [group, setGroup] = useState<TaskGroup>("shoujixiang"), [text, setText] = useState(""), [page, setPage] = useState(1), [editing, setEditing] = useState<TaskRow | null>(null), [, refresh] = useState(0);
  useEffect(() => {
    const release = port.list.subscribe(() => refresh((v) => v + 1));
    const timer = globalThis.setInterval(() => refresh((v) => v + 1), 60000);
    return () => { release(); globalThis.clearInterval(timer); };
  }, [port.list]);
  const result = port.list.query(group, text, page);
  return <section aria-label="待办工作台"><div className="lifeos-filter-bar">{Object.entries(names).map(([value, name]) => <button type="button" key={value} aria-pressed={group === value} onClick={() => { setGroup(value as TaskGroup); setPage(1); }}>{name}</button>)}<button type="button" onClick={port.create}>新建待办</button></div><label>搜索待办<input value={text} onChange={(e) => { setText(e.target.value); setPage(1); }} /></label><p>今天：{result.today}。逾期优先归组，跨天沿用原待办；全部包含完成、取消和归档记录。</p>
    {!result.ready ? <p>正在读取待办…</p> : <><p role="status">共 {result.total} 条；{result.issues} 项索引问题，可运行完整性检查核对。</p><div className="lifeos-relation-results" role="region" aria-label="待办列表" tabIndex={0}>{result.items.map((row) => <article className="lifeos-module-row" key={row.id}><div><button type="button" onClick={() => port.open(row.id)}>{row.title}</button><p>{progressNames[String(row.source.attributes.jindu)]}{row.source.attributes.yiquxiao === true && " · 已取消"}{row.source.attributes.yiguidang === true && " · 已归档"} · {names[row.group]}</p><p>开始：{String(row.source.attributes.kaishiriqi ?? "未填写")} · 截止：{String(row.source.attributes.jiezhiriqi ?? "未填写")}</p></div><div className="lifeos-template-actions"><button type="button" onClick={() => setEditing(row)}>编辑日期</button><button type="button" onClick={() => port.progress(row.id)}>修改进度</button><button type="button" onClick={() => port.relations(row.id)}>关联 / 项目归属</button></div></article>)}{!result.items.length && <p>暂无符合条件的待办。</p>}</div><div className="lifeos-filter-bar"><button type="button" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>下一页</button></div></>}
    {editing && <Dates key={editing.id} row={editing} service={port.service} close={() => setEditing(null)} />}
  </section>;
}
