import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../ports/entity-store";
import type { Jindu } from "../domain/entities";
import { GameService, gameFields, type GameDraft } from "../services/game-service";
export interface GamePort { service: GameService; create: () => void; open: (id: string) => void }
const labels: Record<string, string> = { leixing: "类型", jianjie: "简介", faxingshijian: "发行日期", pingjia: "评价", biaoqian: "tags（每行一个）" };
const progressNames = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
export function GameEditor({ source, service, close }: { source: Snapshot; service: GameService; close: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(gameFields.map(k => [k, k === "biaoqian" ? (source.attributes[k] as string[]).join("\n") : String(source.attributes[k] ?? "")])));
  const [progress, setProgress] = useState(source.attributes.jindu as Jindu), [body, setBody] = useState(source.body), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [draft, setDraft] = useState<GameDraft | null>(null);
  const saving = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save() {
    if (saving.current) return; saving.current = true; setBusy(true);
    try {
      const fields = Object.fromEntries(gameFields.map(k => [k, k === "biaoqian" ? [...new Set((values[k] ?? "").split(/\r?\n/).map(t => t.trim()).filter(Boolean))] : values[k] ?? ""]));
      const request = draft ?? await service.prepare(source, { fields, progress, body });
      if (mounted.current) setDraft(request); await service.execute(request); if (mounted.current) close();
    } catch (e) { if (mounted.current) setMessage(e instanceof Error ? e.message : String(e)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  return <section aria-label="游戏编辑"><h3>{source.path.split("/").pop()?.replace(/\.md$/i, "")}</h3><p>名称沿用笔记文件名，可在原笔记中重命名。</p><fieldset disabled={busy || !!draft}><label>进度<select value={progress} onChange={e => setProgress(e.target.value as Jindu)}>{Object.entries(progressNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    {gameFields.map(k => <label key={k}>{labels[k]}{["biaoqian", "jianjie", "pingjia"].includes(k) ? <textarea value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} /> : <input type={k === "faxingshijian" ? "date" : "text"} value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} />}</label>)}
    <label>正文<textarea rows={10} value={body} onChange={e => setBody(e.target.value)} /></label></fieldset><p role="status">{message}</p><div className="lifeos-template-actions"><button type="button" disabled={busy} onClick={close}>关闭编辑</button><button type="button" disabled={busy} onClick={() => { void save(); }}>{draft ? "重试保存" : "保存游戏"}</button></div></section>;
}
export function GamePage({ port }: { port: GamePort }) {
  const [text, setText] = useState(""), [tag, setTag] = useState(""), [progress, setProgress] = useState(""), [type, setType] = useState(""), [page, setPage] = useState(1), [editing, setEditing] = useState<Snapshot | null>(null), [, refresh] = useState(0);
  useEffect(() => port.service.subscribe(() => refresh(v => v + 1)), [port.service]);
  const result = port.service.list(text, progress, tag, page, type);
  return <section aria-label="游戏工作台"><div className="lifeos-filter-bar"><button type="button" onClick={port.create}>新建游戏笔记</button><label>进度<select value={progress} onChange={e => { setProgress(e.target.value); setPage(1); }}><option value="">全部进度</option>{Object.entries(progressNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div><label>搜索名称、简介、评价与正文<input value={text} onChange={e => { setText(e.target.value); setPage(1); }} /></label><label>类型（精确匹配）<input value={type} onChange={e => { setType(e.target.value); setPage(1); }} /></label><label>tags筛选<input value={tag} onChange={e => { setTag(e.target.value); setPage(1); }} /></label>
    {!result.ready ? <p>正在读取游戏笔记…</p> : <><p role="status">共 {result.total} 条；{result.issues} 项索引问题。</p><div className="lifeos-relation-results" role="region" aria-label="游戏列表" tabIndex={0}>{result.items.map(s => <article key={String(s.attributes.biaoshi)} className="lifeos-module-row"><div><strong>{s.path.split("/").pop()?.replace(/\.md$/i, "")}</strong><p>{String(s.attributes.leixing ?? "类型未填写")} · {progressNames[s.attributes.jindu as Jindu]}</p><p>发行：{String(s.attributes.faxingshijian ?? "未填写")} · {(s.attributes.biaoqian as string[]).join("、")}</p></div><div className="lifeos-template-actions"><button type="button" onClick={() => setEditing(s)}>编辑游戏</button><button type="button" onClick={() => port.open(String(s.attributes.biaoshi))}>打开原笔记</button></div></article>)}{!result.items.length && <p>暂无符合条件的游戏笔记。</p>}</div><div className="lifeos-filter-bar"><button type="button" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>下一页</button></div></>}
    {editing && <GameEditor key={`${editing.path}:${editing.version.original}`} source={editing} service={port.service} close={() => setEditing(null)} />}</section>;
}
