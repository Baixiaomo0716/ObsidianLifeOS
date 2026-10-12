import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../ports/entity-store";
import type { Jindu } from "../domain/entities";
import { TravelService, travelFields, type TravelDraft } from "../services/travel-service";
export interface TravelPort { service: TravelService; create: () => void; open: (id: string) => void }
const labels: Record<string, string> = { kaishiriqi: "开始日期", jieshuriqi: "结束日期", didian: "地点（每行一个）", jiaotonggongju: "交通工具（每行一个）", zhusu: "住宿（每行一个）", pingjia: "评价", biaoqian: "tags（每行一个）" };
const progressNames = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
const listFields = ["didian", "jiaotonggongju", "zhusu", "biaoqian"];
export function TravelEditor({ source, service, close }: { source: Snapshot; service: TravelService; close: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(travelFields.map(k => [k, listFields.includes(k) ? (source.attributes[k] as string[]).join("\n") : String(source.attributes[k] ?? "")])));
  const [progress, setProgress] = useState(source.attributes.jindu as Jindu), [body, setBody] = useState(source.body), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [draft, setDraft] = useState<TravelDraft | null>(null);
  const saving = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save() {
    if (saving.current) return; saving.current = true; setBusy(true);
    try {
      const fields = Object.fromEntries(travelFields.map(k => [k, listFields.includes(k) ? [...new Set((values[k] ?? "").split(/\r?\n/).map(t => t.trim()).filter(Boolean))] : values[k] ?? ""]));
      const request = draft ?? await service.prepare(source, { fields, progress, body });
      if (mounted.current) setDraft(request); await service.execute(request); if (mounted.current) close();
    } catch (e) { if (mounted.current) setMessage(e instanceof Error ? e.message : String(e)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  return <section aria-label="旅行编辑"><h3>{source.path.split("/").pop()?.replace(/\.md$/i, "")}</h3><p>名称沿用笔记文件名。开始日期不能晚于结束日期。</p><fieldset disabled={busy || !!draft}><label>进度<select value={progress} onChange={e => setProgress(e.target.value as Jindu)}>{Object.entries(progressNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    {travelFields.map(k => <label key={k}>{labels[k]}{[...listFields, "pingjia"].includes(k) ? <textarea value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} /> : <input type="date" value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} />}</label>)}
    <label>正文<textarea rows={10} value={body} onChange={e => setBody(e.target.value)} /></label></fieldset><p role="status">{message}</p><div className="lifeos-template-actions"><button type="button" disabled={busy} onClick={close}>关闭编辑</button><button type="button" disabled={busy} onClick={() => { void save(); }}>{draft ? "重试保存" : "保存旅行"}</button></div></section>;
}
export function TravelPage({ port }: { port: TravelPort }) {
  const [text, setText] = useState(""), [tag, setTag] = useState(""), [progress, setProgress] = useState(""), [page, setPage] = useState(1), [editing, setEditing] = useState<Snapshot | null>(null), [, refresh] = useState(0);
  useEffect(() => port.service.subscribe(() => refresh(v => v + 1)), [port.service]);
  const result = port.service.list(text, progress, tag, page);
  return <section aria-label="旅行工作台"><div className="lifeos-filter-bar"><button type="button" onClick={port.create}>新建旅行笔记</button><label>进度<select value={progress} onChange={e => { setProgress(e.target.value); setPage(1); }}><option value="">全部进度</option>{Object.entries(progressNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div><label>搜索名称、地点、交通、住宿与内容<input value={text} onChange={e => { setText(e.target.value); setPage(1); }} /></label><label>tags筛选<input value={tag} onChange={e => { setTag(e.target.value); setPage(1); }} /></label>
    {!result.ready ? <p>正在读取旅行笔记…</p> : <><p role="status">共 {result.total} 条；{result.issues} 项索引问题。</p><div className="lifeos-relation-results" role="region" aria-label="旅行列表" tabIndex={0}>{result.items.map(s => <article key={String(s.attributes.biaoshi)} className="lifeos-module-row"><div><strong>{s.path.split("/").pop()?.replace(/\.md$/i, "")}</strong><p>{progressNames[s.attributes.jindu as Jindu]} · {String(s.attributes.kaishiriqi ?? "开始未填写")} — {String(s.attributes.jieshuriqi ?? "结束未填写")}</p><p>地点：{(s.attributes.didian as string[]).join("、") || "未填写"}</p><p>交通：{(s.attributes.jiaotonggongju as string[]).join("、") || "未填写"} · 住宿：{(s.attributes.zhusu as string[]).join("、") || "未填写"}</p></div><div className="lifeos-template-actions"><button type="button" onClick={() => setEditing(s)}>编辑旅行</button><button type="button" onClick={() => port.open(String(s.attributes.biaoshi))}>打开原笔记</button></div></article>)}{!result.items.length && <p>暂无符合条件的旅行笔记。</p>}</div><div className="lifeos-filter-bar"><button type="button" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>下一页</button></div></>}
    {editing && <TravelEditor key={`${editing.path}:${editing.version.original}`} source={editing} service={port.service} close={() => setEditing(null)} />}</section>;
}
