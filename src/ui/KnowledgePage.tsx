import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../ports/entity-store";
import type { Jindu } from "../domain/entities";
import type { KnowledgeService, KnowledgeDraft } from "../services/knowledge-service";
export interface KnowledgePort { service: KnowledgeService; create: () => void; open: (id: string) => void }
const names = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
const title = (s: Snapshot) => s.path.split("/").pop()?.replace(/\.md$/i, "");
export function KnowledgeEditor({ source, service, close }: { source: Snapshot; service: KnowledgeService; close: () => void }) {
  const [content, setContent] = useState(String(source.attributes.neirong ?? "")), [tags, setTags] = useState((source.attributes.biaoqian as string[]).join("\n")), [progress, setProgress] = useState((source.attributes.jindu ?? "weikaishi") as Jindu), [body, setBody] = useState(source.body), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [draft, setDraft] = useState<KnowledgeDraft | null>(null);
  const saving = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save() {
    if (saving.current) return; saving.current = true; setBusy(true);
    try {
      const request = draft ?? await service.prepare(source, { fields: { neirong: content, biaoqian: [...new Set(tags.split(/\r?\n/).map(t => t.trim()).filter(Boolean))] }, progress, body });
      if (mounted.current) setDraft(request); await service.execute(request); if (mounted.current) close();
    } catch (e) { if (mounted.current) setMessage(e instanceof Error ? e.message : String(e)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  }
  return <section aria-label="知识编辑"><h3>{title(source)}</h3><p>名称在原笔记中修改。正文可保留 [[笔记名]] 双链，在原笔记中打开链接。</p><fieldset disabled={busy || !!draft}><label>进度<select value={progress} onChange={e => setProgress(e.target.value as Jindu)}>{Object.entries(names).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>tags（每行一个）<textarea value={tags} onChange={e => setTags(e.target.value)} /></label><label>内容<textarea rows={4} value={content} onChange={e => setContent(e.target.value)} /></label><label>正文<textarea rows={12} value={body} onChange={e => setBody(e.target.value)} /></label></fieldset><p role="status">{message}</p><div className="lifeos-template-actions"><button type="button" disabled={busy} onClick={close}>关闭编辑</button><button type="button" disabled={busy} onClick={() => { void save(); }}>{draft ? "重试保存" : "保存知识"}</button></div></section>;
}
export function KnowledgePage({ port }: { port: KnowledgePort }) {
  const [text, setText] = useState(""), [tag, setTag] = useState(""), [progress, setProgress] = useState(""), [page, setPage] = useState(1), [selected, setSelected] = useState(""), [editing, setEditing] = useState<Snapshot | null>(null), [, refresh] = useState(0);
  useEffect(() => port.service.subscribe(() => refresh(v => v + 1)), [port.service]);
  const result = port.service.list(text, progress, tag, page), detail = selected ? port.service.get(selected) : undefined, incoming = detail ? port.service.incoming(selected) : [];
  return <section aria-label="知识工作台"><div className="lifeos-filter-bar"><button type="button" onClick={port.create}>新建知识笔记</button><label>进度<select value={progress} onChange={e => { setProgress(e.target.value); setPage(1); }}><option value="">全部进度</option>{Object.entries(names).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div><label>搜索名称、内容与正文<input value={text} onChange={e => { setText(e.target.value); setPage(1); }} /></label><label>tags筛选<input value={tag} onChange={e => { setTag(e.target.value); setPage(1); }} /></label>
    {!result.ready ? <p>正在读取知识笔记…</p> : <><p role="status">共 {result.total} 条；{result.issues} 项索引问题。</p><div className="lifeos-relation-results" role="region" aria-label="知识列表" tabIndex={0}>{result.items.map(s => <article key={String(s.attributes.biaoshi)} className="lifeos-module-row"><div><button type="button" onClick={() => setSelected(String(s.attributes.biaoshi))}>{title(s)}</button><p>{names[s.attributes.jindu as Jindu] ?? "进度未填写"} · {(s.attributes.biaoqian as string[]).join("、")}</p></div><div className="lifeos-template-actions"><button type="button" onClick={() => setEditing(s)}>编辑知识</button><button type="button" onClick={() => port.open(String(s.attributes.biaoshi))}>打开原笔记</button></div></article>)}{!result.items.length && <p>暂无符合条件的知识笔记。</p>}</div><div className="lifeos-filter-bar"><button type="button" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>下一页</button></div></>}
    {selected && !detail && <p>知识笔记已回收或存在争议，请核对原文件。</p>}{detail && <section aria-label="知识详情"><h3>{title(detail)}</h3>{Boolean(detail.attributes.neirong) && <pre className="lifeos-relation-results">{String(detail.attributes.neirong)}</pre>}<pre className="lifeos-relation-results">{detail.body}</pre><h4>被哪些记录关联</h4><div className="lifeos-relation-results" role="region" aria-label="知识被关联列表" tabIndex={0}>{incoming.map(s => <p key={String(s.attributes.biaoshi)}><button type="button" onClick={() => port.open(String(s.attributes.biaoshi))}>{title(s)}</button></p>)}{!incoming.length && <p>暂无记录关联。可在日记或待办中选择此知识。</p>}</div><button type="button" onClick={() => port.open(selected)}>打开知识原笔记</button></section>}
    {editing && <KnowledgeEditor key={`${editing.path}:${editing.version.original}`} source={editing} service={port.service} close={() => setEditing(null)} />}</section>;
}
