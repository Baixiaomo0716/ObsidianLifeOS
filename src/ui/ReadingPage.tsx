import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../ports/entity-store";
import type { Jindu } from "../domain/entities";
import { ReadingService, readingFields, type ReadingDraft } from "../services/reading-service";
export interface ReadingPort { service: ReadingService; create: () => void; open: (id: string) => void }
const labels: Record<string, string> = { zuozhe: "作者", laiyuan: "来源", leixing: "类型", biaoqian: "tags（每行一个）", zishu: "字数", jianjie: "简介", pingjia: "评价", pingfen: "评分（0–10）", kaishishijian: "开始时间", duwanshijian: "读完时间" };
const progressNames = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
function localTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
export function ReadingEditor({ source, service, close }: { source: Snapshot; service: ReadingService; close: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(readingFields.map(k => [k, k === "biaoqian" ? (source.attributes[k] as string[]).join("\n") : k.endsWith("shijian") ? localTime(source.attributes[k]) : String(source.attributes[k] ?? "")])));
  const [progress, setProgress] = useState(source.attributes.zhuangtai as Jindu), [body, setBody] = useState(source.body), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [draft, setDraft] = useState<ReadingDraft | null>(null);
  const saving = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save() {
    if (saving.current) return; saving.current = true; setBusy(true);
    try {
      const fields = Object.fromEntries(readingFields.map(k => {
        const value = values[k] ?? "";
        return [k, k === "biaoqian" ? [...new Set(value.split(/\r?\n/).map(t => t.trim()).filter(Boolean))] : !value ? "" : k.endsWith("shijian") ? new Date(value).toISOString() : ["zishu", "pingfen"].includes(k) ? Number(value) : value];
      }));
      const request = draft ?? await service.prepare(source, { fields, progress, body });
      if (mounted.current) setDraft(request); await service.execute(request); if (mounted.current) close();
    } catch (e) { if (mounted.current) setMessage(e instanceof Error ? e.message : String(e)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  return <section aria-label="阅读编辑"><h3>{source.path.split("/").pop()?.replace(/\.md$/i, "")}</h3><p>名称沿用笔记文件名，可在原笔记中重命名。时间按当前设备时区填写。</p><fieldset disabled={busy || !!draft}><label>进度<select value={progress} onChange={e => { const value = e.target.value as Jindu; setProgress(value); if (value !== "yiwancheng") setValues(v => ({ ...v, duwanshijian: "" })); }}>{Object.entries(progressNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    {readingFields.map(k => <label key={k}>{labels[k]}{["biaoqian", "jianjie", "pingjia"].includes(k) ? <textarea value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} /> : <input type={k.endsWith("shijian") ? "datetime-local" : ["zishu", "pingfen"].includes(k) ? "number" : "text"} step={k.endsWith("shijian") ? "1" : k === "pingfen" ? "any" : undefined} min={["zishu", "pingfen"].includes(k) ? 0 : undefined} max={k === "pingfen" ? 10 : undefined} disabled={k === "duwanshijian" && progress !== "yiwancheng"} value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} />}</label>)}
    <label>正文<textarea rows={10} value={body} onChange={e => setBody(e.target.value)} /></label></fieldset><p role="status">{message}</p><div className="lifeos-template-actions"><button type="button" disabled={busy} onClick={close}>关闭编辑</button><button type="button" disabled={busy} onClick={() => { void save(); }}>{draft ? "重试保存" : "保存阅读"}</button></div></section>;
}
export function ReadingPage({ port }: { port: ReadingPort }) {
  const [text, setText] = useState(""), [tag, setTag] = useState(""), [progress, setProgress] = useState(""), [page, setPage] = useState(1), [editing, setEditing] = useState<Snapshot | null>(null), [, refresh] = useState(0);
  useEffect(() => port.service.subscribe(() => refresh(v => v + 1)), [port.service]);
  const result = port.service.list(text, progress, tag, page);
  return <section aria-label="阅读工作台"><div className="lifeos-filter-bar"><button type="button" onClick={port.create}>新建阅读笔记</button><label>进度<select value={progress} onChange={e => { setProgress(e.target.value); setPage(1); }}><option value="">全部进度</option>{Object.entries(progressNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div><label>搜索名称、作者、来源与内容<input value={text} onChange={e => { setText(e.target.value); setPage(1); }} /></label><label>tags筛选<input value={tag} onChange={e => { setTag(e.target.value); setPage(1); }} /></label>
    {!result.ready ? <p>正在读取阅读笔记…</p> : <><p role="status">共 {result.total} 条；{result.issues} 项索引问题。</p><div className="lifeos-relation-results" role="region" aria-label="阅读列表" tabIndex={0}>{result.items.map(s => <article key={String(s.attributes.biaoshi)} className="lifeos-module-row"><div><strong>{s.path.split("/").pop()?.replace(/\.md$/i, "")}</strong><p>{String(s.attributes.zuozhe ?? "作者未填写")} · {String(s.attributes.leixing ?? "类型未填写")} · {progressNames[s.attributes.zhuangtai as Jindu]}</p><p>{String(s.attributes.pingfen ?? "未评分")} · {(s.attributes.biaoqian as string[]).join("、")}</p></div><div className="lifeos-template-actions"><button type="button" onClick={() => setEditing(s)}>编辑阅读</button><button type="button" onClick={() => port.open(String(s.attributes.biaoshi))}>打开原笔记</button></div></article>)}{!result.items.length && <p>暂无符合条件的阅读笔记。</p>}</div><div className="lifeos-filter-bar"><button type="button" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>下一页</button></div></>}
    {editing && <ReadingEditor key={`${editing.path}:${editing.version.original}`} source={editing} service={port.service} close={() => setEditing(null)} />}</section>;
}
