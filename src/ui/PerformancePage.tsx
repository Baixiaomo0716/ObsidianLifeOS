import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../ports/entity-store";
import type { Jindu } from "../domain/entities";
import { PerformanceService, performanceFields, type PerformanceDraft } from "../services/performance-service";
export interface PerformancePort { service: PerformanceService; create: () => void; open: (id: string) => void }
const labels: Record<string, string> = { leixing: "类型", yueduimingcheng: "乐队名称（每行一个）", shijian: "演出时间", didian: "地点（每行一个）", jianjie: "简介", pingjia: "评价", pingfen: "评分（0–10）", biaoqian: "tags（每行一个）" };
const progressNames = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
const listFields = ["yueduimingcheng", "didian", "biaoqian"];
function localTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
export function PerformanceEditor({ source, service, close }: { source: Snapshot; service: PerformanceService; close: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(performanceFields.map(k => [k, listFields.includes(k) ? (source.attributes[k] as string[]).join("\n") : k === "shijian" ? localTime(source.attributes[k]) : String(source.attributes[k] ?? "")])));
  const [progress, setProgress] = useState(source.attributes.jindu as Jindu), [body, setBody] = useState(source.body), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [draft, setDraft] = useState<PerformanceDraft | null>(null);
  const saving = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save() {
    if (saving.current) return; saving.current = true; setBusy(true);
    try {
      const fields = Object.fromEntries(performanceFields.map(k => {
        const value = values[k] ?? "";
        return [k, listFields.includes(k) ? [...new Set(value.split(/\r?\n/).map(t => t.trim()).filter(Boolean))] : !value ? "" : k === "shijian" ? new Date(value).toISOString() : k === "pingfen" ? Number(value) : value];
      }));
      const request = draft ?? await service.prepare(source, { fields, progress, body });
      if (mounted.current) setDraft(request); await service.execute(request); if (mounted.current) close();
    } catch (e) { if (mounted.current) setMessage(e instanceof Error ? e.message : String(e)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  return <section aria-label="演出编辑"><h3>{source.path.split("/").pop()?.replace(/\.md$/i, "")}</h3><p>名称沿用笔记文件名。演出时间按当前设备时区填写。</p><fieldset disabled={busy || !!draft}><label>进度<select value={progress} onChange={e => setProgress(e.target.value as Jindu)}>{Object.entries(progressNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    {performanceFields.map(k => <label key={k}>{labels[k]}{[...listFields, "jianjie", "pingjia"].includes(k) ? <textarea value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} /> : <input type={k === "shijian" ? "datetime-local" : k === "pingfen" ? "number" : "text"} step={k === "shijian" ? "1" : k === "pingfen" ? "any" : undefined} min={k === "pingfen" ? 0 : undefined} max={k === "pingfen" ? 10 : undefined} value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} />}</label>)}
    <label>正文<textarea rows={10} value={body} onChange={e => setBody(e.target.value)} /></label></fieldset><p role="status">{message}</p><div className="lifeos-template-actions"><button type="button" disabled={busy} onClick={close}>关闭编辑</button><button type="button" disabled={busy} onClick={() => { void save(); }}>{draft ? "重试保存" : "保存演出"}</button></div></section>;
}
export function PerformancePage({ port }: { port: PerformancePort }) {
  const [text, setText] = useState(""), [tag, setTag] = useState(""), [progress, setProgress] = useState(""), [type, setType] = useState(""), [page, setPage] = useState(1), [editing, setEditing] = useState<Snapshot | null>(null), [, refresh] = useState(0);
  useEffect(() => port.service.subscribe(() => refresh(v => v + 1)), [port.service]);
  const result = port.service.list(text, progress, tag, page, type);
  return <section aria-label="演出工作台"><div className="lifeos-filter-bar"><button type="button" onClick={port.create}>新建演出笔记</button><label>进度<select value={progress} onChange={e => { setProgress(e.target.value); setPage(1); }}><option value="">全部进度</option>{Object.entries(progressNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>类型（精确匹配）<input value={type} onChange={e => { setType(e.target.value); setPage(1); }} /></label></div><label>搜索名称、乐队、地点与内容<input value={text} onChange={e => { setText(e.target.value); setPage(1); }} /></label><label>tags筛选<input value={tag} onChange={e => { setTag(e.target.value); setPage(1); }} /></label>
    {!result.ready ? <p>正在读取演出笔记…</p> : <><p role="status">共 {result.total} 条；{result.issues} 项索引问题。</p><div className="lifeos-relation-results" role="region" aria-label="演出列表" tabIndex={0}>{result.items.map(s => <article key={String(s.attributes.biaoshi)} className="lifeos-module-row"><div><strong>{s.path.split("/").pop()?.replace(/\.md$/i, "")}</strong><p>{String(s.attributes.leixing ?? "类型未填写")} · {progressNames[s.attributes.jindu as Jindu]}</p><p>乐队：{(s.attributes.yueduimingcheng as string[]).join("、") || "未填写"} · 地点：{(s.attributes.didian as string[]).join("、") || "未填写"}</p><p>评分：{String(s.attributes.pingfen ?? "未填写")} · 时间：{s.attributes.shijian ? new Date(String(s.attributes.shijian)).toLocaleString() : "未填写"}</p></div><div className="lifeos-template-actions"><button type="button" onClick={() => setEditing(s)}>编辑演出</button><button type="button" onClick={() => port.open(String(s.attributes.biaoshi))}>打开原笔记</button></div></article>)}{!result.items.length && <p>暂无符合条件的演出笔记。</p>}</div><div className="lifeos-filter-bar"><button type="button" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>下一页</button></div></>}
    {editing && <PerformanceEditor key={`${editing.path}:${editing.version.original}`} source={editing} service={port.service} close={() => setEditing(null)} />}</section>;
}
