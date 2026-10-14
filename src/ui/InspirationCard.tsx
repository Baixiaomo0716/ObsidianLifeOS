import { useEffect, useId, useRef, useState } from "react";
import type { InspirationService } from "../services/inspiration-service";
import type { Snapshot } from "../ports/entity-store";
export interface InspirationPort { service: InspirationService; open: (id: string) => void }
export function InspirationCard({ port }: { port?: InspirationPort | undefined }) {
  const id = useId(), [, refresh] = useState(0), [mode, setMode] = useState<"closed" | "list" | "edit">("closed"), [source, setSource] = useState<Snapshot | undefined>(), [text, setText] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const lock = useRef(false), draft = useRef<Awaited<ReturnType<InspirationService["prepare"]>> | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => port?.service.subscribe(() => refresh(n => n + 1)), [port]);
  useEffect(() => { if (mode !== "closed") dialog.current?.showModal(); else dialog.current?.close(); }, [mode]);
  const notes = port?.service.list() ?? [], latest = notes[0];
  const content = (s: Snapshot) => (s.body.trim() || String(s.attributes.neirong ?? "")).trim();
  function edit(s?: Snapshot) { setSource(s); setText(s ? content(s) : ""); draft.current = undefined; setMessage(""); setMode("edit"); }
  async function save() {
    if (!port || lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try { draft.current ??= await port.service.prepare(text, source); await port.service.execute(draft.current); draft.current = undefined; setMode("closed"); }
    catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="lifeos-card lifeos-inspiration" aria-labelledby={id}><header className="lifeos-card-header"><h2 id={id}>灵感便签</h2><span className="lifeos-card-caption">留住一闪而过的想法</span></header><div className="lifeos-card-body"><button className="lifeos-inspiration-paper" type="button" disabled={!latest} onClick={() => edit(latest)}><span>{latest ? content(latest) : "把一闪而过的想法，留在这里。"}</span><small>{latest ? new Date(String(latest.attributes.gengxinshijian)).toLocaleString("zh-CN", { timeZone: String(latest.attributes.bijishiqu ?? "Asia/Shanghai"), month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) + " · 随手记" : port ? "还没有便签，记下第一个灵感吧" : "启用知识模块后即可记录灵感"}</small><svg viewBox="0 0 70 70" aria-hidden="true"><path fill="#f8f1e6" stroke="#191919" strokeWidth="2" d="M10 15 45 8l10 45-35 7Z"/><path fill="none" stroke="#191919" strokeWidth="2" d="m18 24 24-5 m-22 15 24-5 m-22 15 24-5"/><path fill="#dfa05d" stroke="#191919" strokeWidth="2" d="m50 55 10-40 6 2-10 40-6 6Z"/></svg></button><div className="lifeos-inspiration-actions"><button type="button" disabled={!port} onClick={() => edit()}>＋ 记下灵感</button><button type="button" disabled={!port} onClick={() => setMode("list")}>查看全部 →</button></div></div><dialog ref={dialog} className="lifeos-inspiration-dialog" onCancel={e => { if (busy) e.preventDefault(); else setMode("closed"); }}><h2>{mode === "edit" ? source ? "编辑灵感" : "记下灵感" : "全部灵感便签"}</h2>{mode === "edit" ? <><label htmlFor={`${id}-text`}>灵感内容</label><textarea id={`${id}-text`} maxLength={2000} rows={6} value={text} disabled={busy || !!draft.current} onChange={e => setText(e.target.value)} /><p role="status">{message}</p><button type="button" disabled={busy || !text.trim()} onClick={() => { void save(); }}>{busy ? "保存中…" : draft.current ? "重试保存" : "保存灵感"}</button></> : <div className="lifeos-inspiration-list">{notes.map(s => <article key={String(s.attributes.biaoshi)}><p>{content(s)}</p><button type="button" onClick={() => edit(s)}>编辑</button><button type="button" onClick={() => port?.open(String(s.attributes.biaoshi))}>打开原笔记</button></article>)}{!notes.length && <p>暂无灵感便签。</p>}</div>}<button type="button" disabled={busy} onClick={() => setMode("closed")}>关闭</button></dialog></section>;
}
