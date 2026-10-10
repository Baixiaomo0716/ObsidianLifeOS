import { useEffect, useId, useRef, useState } from "react";
import { shiti, type Shiti } from "../domain/entities";
import type { Snapshot } from "../ports/entity-store";
import { typeLabels, type SearchService } from "../services/search-service";
import { type RelationDraft, type RelationService } from "../services/relation-service";
export interface RelationPickerProps { source: Snapshot; search: SearchService; service: RelationService; allowed: readonly Shiti[]; close: () => void; active: () => boolean; saved: () => void; failed?: (message: string) => void }
export function RelationPicker({ source, search, service, allowed, close, active, saved, failed }: RelationPickerProps) {
  const id = useId(), [type, setType] = useState<Shiti>(allowed[0] ?? "riji"), [text, setText] = useState(""), [selected, setSelected] = useState<string[]>((source.attributes.guanlian as string[]).map((id) => id.toLowerCase())), [page, setPage] = useState(1), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [draft, setDraft] = useState<RelationDraft | null>(null), [, refresh] = useState(0);
  useEffect(() => { const release = search.subscribe(() => refresh((v) => v + 1)); refresh((v) => v + 1); return release; }, [search]);
  const result = search.query({ type, allowed, text, page }), self = String(source.attributes.biaoshi).toLowerCase();
  const locked = busy || draft !== null;
  const saving = useRef(false);
  const toggle = (target: string) => setSelected((previous) => previous.includes(target) ? previous.filter((id) => id !== target) : [...previous, target]);
  const save = async () => {
    if (saving.current || !active()) return;
    saving.current = true;
    setBusy(true); setMessage("正在保存关联…");
    try { const request = draft ?? await service.prepare(source, selected); if (active()) setDraft(request); await service.execute(request); saved(); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); if (active()) setMessage(message); else failed?.(message); }
    finally { saving.current = false; if (active()) setBusy(false); }
  };
  return <section className="lifeos-relation-picker" aria-label="编辑关联">
    <h2>编辑关联</h2><p>先选择类型，再搜索并勾选。切换类型会保留已选记录；移除关联只解除引用。</p>
    <div className="lifeos-query-fields"><label htmlFor={`${id}-type`}>记录类型<select id={`${id}-type`} value={type} disabled={locked} onChange={(e) => { setType(e.target.value as Shiti); setText(""); setPage(1); }}>{shiti.filter((type) => allowed.includes(type)).map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></label><label htmlFor={`${id}-search`}>搜索记录<input id={`${id}-search`} value={text} disabled={locked} onChange={(e) => { setText(e.target.value); setPage(1); }} /></label></div>
    <div className="lifeos-relation-results" role="region" aria-label="可关联记录" tabIndex={0}>{result.items.filter((item) => item.id !== self).map((item) => <label className="lifeos-relation-choice" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={locked} onChange={() => toggle(item.id)} /><span>{item.title}</span></label>)}{!result.items.some((item) => item.id !== self) && <p>当前没有可选记录。新建后返回关联将在后续日记模块接入。</p>}</div>
    <div className="lifeos-filter-bar"><button type="button" disabled={locked || result.page <= 1} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={locked || result.page >= result.pages} onClick={() => setPage(result.page + 1)}>下一页</button></div>
    <h3>已选择 {selected.length} 条</h3><div className="lifeos-relation-results" role="region" aria-label="已选关联" tabIndex={0}>{selected.map((target) => { const item = search.relations(target).target; return <div className="lifeos-module-row" key={target}><span>{item ? `${typeLabels[item.type]} · ${item.title}` : `目标暂不可用：${target}`}</span><button type="button" disabled={locked} onClick={() => toggle(target)} aria-label={`移除${item?.title ?? target}`}>移除</button></div>; })}</div>
    <p role="status" aria-live="polite">{message}</p>{draft && !busy && <p>重试会沿用同一保存请求。需要重新选择时，请关闭后重新打开。</p>}
    <div className="lifeos-template-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className="mod-cta" disabled={busy} onClick={() => { void save(); }}>{busy ? "保存中…" : draft ? "重试保存" : "保存关联"}</button></div>
  </section>;
}
