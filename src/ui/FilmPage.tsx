import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../ports/entity-store";
import type { Jindu } from "../domain/entities";
import { FilmService, filmFields, type FilmDraft } from "../services/film-service";
export interface FilmPort { service: FilmService; create: () => void; open: (id: string) => void }
const types: Record<string, string> = { dianying: "电影", dianshiju: "电视剧", jilupian: "纪录片", donghua: "动画", zongyi: "综艺", qita: "其他" };
const labels: Record<string, string> = { leixing: "类型", daoyan: "导演（每行一人）", zhuyan: "主演（每行一人）", shangyingshijian: "上映日期", guankanshijian: "观看时间", jianjie: "简介", pingjia: "评价", doubanpingfen: "豆瓣评分（0–10）", biaoqian: "tags（每行一个）" };
const progressNames = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
const listFields = ["daoyan", "zhuyan", "biaoqian"];
function localTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
export function FilmEditor({ source, service, close }: { source: Snapshot; service: FilmService; close: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(filmFields.map(k => [k, listFields.includes(k) ? (source.attributes[k] as string[]).join("\n") : k === "guankanshijian" ? localTime(source.attributes[k]) : String(source.attributes[k] ?? "")])));
  const [progress, setProgress] = useState(source.attributes.jindu as Jindu), [body, setBody] = useState(source.body), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [draft, setDraft] = useState<FilmDraft | null>(null);
  const saving = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save() {
    if (saving.current) return; saving.current = true; setBusy(true);
    try {
      const fields = Object.fromEntries(filmFields.map(k => {
        const value = values[k] ?? "";
        return [k, listFields.includes(k) ? [...new Set(value.split(/\r?\n/).map(t => t.trim()).filter(Boolean))] : !value ? "" : k === "guankanshijian" ? new Date(value).toISOString() : k === "doubanpingfen" ? Number(value) : value];
      }));
      const request = draft ?? await service.prepare(source, { fields, progress, body });
      if (mounted.current) setDraft(request); await service.execute(request); if (mounted.current) close();
    } catch (e) { if (mounted.current) setMessage(e instanceof Error ? e.message : String(e)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  return <section aria-label="影视编辑"><h3>{source.path.split("/").pop()?.replace(/\.md$/i, "")}</h3><p>名称沿用笔记文件名。观看时间按当前设备时区填写；豆瓣评分由你手动填写。</p><fieldset disabled={busy || !!draft}><label>进度<select value={progress} onChange={e => setProgress(e.target.value as Jindu)}>{Object.entries(progressNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    {filmFields.map(k => <label key={k}>{labels[k]}{k === "leixing" ? <select value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))}><option value="">未填写</option>{Object.entries(types).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select> : [...listFields, "jianjie", "pingjia"].includes(k) ? <textarea value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} /> : <input type={k === "shangyingshijian" ? "date" : k === "guankanshijian" ? "datetime-local" : "number"} step={k === "guankanshijian" ? "1" : k === "doubanpingfen" ? "any" : undefined} min={k === "doubanpingfen" ? 0 : undefined} max={k === "doubanpingfen" ? 10 : undefined} value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} />}</label>)}
    <label>正文<textarea rows={10} value={body} onChange={e => setBody(e.target.value)} /></label></fieldset><p role="status">{message}</p><div className="lifeos-template-actions"><button type="button" disabled={busy} onClick={close}>关闭编辑</button><button type="button" disabled={busy} onClick={() => { void save(); }}>{draft ? "重试保存" : "保存影视"}</button></div></section>;
}
export function FilmPage({ port }: { port: FilmPort }) {
  const [text, setText] = useState(""), [tag, setTag] = useState(""), [progress, setProgress] = useState(""), [type, setType] = useState(""), [page, setPage] = useState(1), [editing, setEditing] = useState<Snapshot | null>(null), [, refresh] = useState(0);
  useEffect(() => port.service.subscribe(() => refresh(v => v + 1)), [port.service]);
  const result = port.service.list(text, progress, tag, page, type);
  return <section aria-label="影视工作台"><div className="lifeos-filter-bar"><button type="button" onClick={port.create}>新建影视笔记</button><label>进度<select value={progress} onChange={e => { setProgress(e.target.value); setPage(1); }}><option value="">全部进度</option>{Object.entries(progressNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>类型<select value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="">全部类型</option>{Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div><label>搜索名称、导演、主演与内容<input value={text} onChange={e => { setText(e.target.value); setPage(1); }} /></label><label>tags筛选<input value={tag} onChange={e => { setTag(e.target.value); setPage(1); }} /></label>
    {!result.ready ? <p>正在读取影视笔记…</p> : <><p role="status">共 {result.total} 条；{result.issues} 项索引问题。</p><div className="lifeos-relation-results" role="region" aria-label="影视列表" tabIndex={0}>{result.items.map(s => <article key={String(s.attributes.biaoshi)} className="lifeos-module-row"><div><strong>{s.path.split("/").pop()?.replace(/\.md$/i, "")}</strong><p>{types[String(s.attributes.leixing)] ?? "类型未填写"} · {progressNames[s.attributes.jindu as Jindu]}</p><p>导演：{(s.attributes.daoyan as string[]).join("、") || "未填写"} · 主演：{(s.attributes.zhuyan as string[]).join("、") || "未填写"}</p><p>豆瓣评分：{String(s.attributes.doubanpingfen ?? "未填写")} · 观看：{s.attributes.guankanshijian ? new Date(String(s.attributes.guankanshijian)).toLocaleString() : "未填写"}</p></div><div className="lifeos-template-actions"><button type="button" onClick={() => setEditing(s)}>编辑影视</button><button type="button" onClick={() => port.open(String(s.attributes.biaoshi))}>打开原笔记</button></div></article>)}{!result.items.length && <p>暂无符合条件的影视笔记。</p>}</div><div className="lifeos-filter-bar"><button type="button" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>下一页</button></div></>}
    {editing && <FilmEditor key={`${editing.path}:${editing.version.original}`} source={editing} service={port.service} close={() => setEditing(null)} />}</section>;
}
