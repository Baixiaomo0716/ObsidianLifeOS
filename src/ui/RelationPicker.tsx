import { Icon } from "./Icon";
import { ModalHeader } from "./ModalHeader";
import { LedgerForm } from "./LedgerForm";
import type { JournalLedgerRelationService } from "../services/journal-ledger-relation-service";
import { useEffect, useId, useRef, useState } from "react";
import { shiti, type Shiti } from "../domain/entities";
import type { Snapshot } from "../ports/entity-store";
import { typeLabels, type SearchService } from "../services/search-service";
import { type RelationDraft, type RelationService } from "../services/relation-service";
import type { JournalCreateDraft, JournalRelationService } from "../services/journal-relation-service";
export interface RelationPickerProps { source: Snapshot; search: SearchService; service: RelationService; creation?: JournalRelationService; ledgerCreation?: JournalLedgerRelationService; allowed: readonly Shiti[]; close: () => void; active: () => boolean; saved: () => void; failed?: (message: string) => void }
export function RelationPicker({ source, search, service, creation, ledgerCreation, allowed, close, active, saved, failed }: RelationPickerProps) {
  const id = useId(), [type, setType] = useState<Shiti | "all">("all"), [text, setText] = useState(""), [selected, setSelected] = useState<string[]>((source.attributes.guanlian as string[]).map((id) => id.toLowerCase())), [page, setPage] = useState(1), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [draft, setDraft] = useState<RelationDraft | null>(null), [, refresh] = useState(0);
  useEffect(() => { const release = search.subscribe(() => refresh((v) => v + 1)); refresh((v) => v + 1); return release; }, [search]);
  const result = search.query({ type, allowed, text, page }), self = String(source.attributes.biaoshi).toLowerCase();
  const [currentSource, setCurrentSource] = useState(source), [creating, setCreating] = useState(false), [value, setValue] = useState(""), [creationDraft, setCreationDraft] = useState<JournalCreateDraft | null>(null);
  const locked = busy || draft !== null || creating;
  const acceptCreated = (result: { source: Snapshot; selected: string[] }) => {
    if (active()) { setCurrentSource(result.source); setSelected(result.selected); setCreating(false); setCreationDraft(null); setMessage("已保存并关联，原有选择保留。可继续选择或关闭返回日记。"); } else saved();
  };
  const saving = useRef(false);
  const toggle = (target: string) => setSelected((previous) => previous.includes(target) ? previous.filter((id) => id !== target) : [...previous, target]);
  const save = async () => {
    if (saving.current || !active()) return;
    saving.current = true;
    setBusy(true); setMessage("正在保存关联…");
    try { const request = draft ?? await service.prepare(currentSource, selected); if (active()) setDraft(request); await service.execute(request); saved(); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); if (active()) setMessage(message); else failed?.(message); }
    finally { saving.current = false; if (active()) setBusy(false); }
  };
  const create = async () => {
    if (saving.current || !creation || !active() || (type === "jizhang" || type === "all")) return;
    saving.current = true; setBusy(true); setMessage("正在新建并关联…");
    try {
      const request = creationDraft ?? await creation.prepare(currentSource, selected, type, value);
      if (active()) setCreationDraft(request);
      const result = await creation.execute(request);
      acceptCreated(result);
    } catch (error) { const message = error instanceof Error ? error.message : String(error); if (active()) setMessage(message); else failed?.(message); }
    finally { saving.current = false; if (active()) setBusy(false); }
  };
  return <section className="lifeos-relation-picker" aria-label="编辑关联">
    <ModalHeader title="关联记录" subtitle="把有关的生活片段连在一起" icon="link" />
    <label className="lifeos-relation-search" htmlFor={`${id}-search`}><Icon name="search" /><input id={`${id}-search`} aria-label="搜索记录" placeholder="搜索标题或关键词" value={text} disabled={locked} onChange={(e) => { setText(e.target.value); setPage(1); }} /></label>
    <div className="lifeos-relation-types" role="group" aria-label="记录类型">{(["all", ...shiti.filter((item) => allowed.includes(item))] as const).map((item) => <button type="button" key={item} aria-pressed={type === item} disabled={locked} onClick={() => { setType(item); setText(""); setPage(1); }}>{item === "all" ? "全部" : typeLabels[item]}</button>)}</div>
    <div className="lifeos-relation-results" role="region" aria-label="可关联记录" tabIndex={0}>{result.items.filter((item) => item.id !== self).map((item) => <label className="lifeos-relation-choice" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={locked} onChange={() => toggle(item.id)} /><Icon name={item.type} /><span>{item.title}</span><small className="lifeos-modal-type" data-type={item.type}>{typeLabels[item.type]}</small></label>)}{!result.items.some((item) => item.id !== self) && <p>{result.ready ? "当前没有可选记录。" : "正在加载记录…"}</p>}</div>
    {creation && currentSource.attributes.shiti === "riji" && <>{type !== "all" && type !== "jizhang" && creation.types.includes(type) ? <button type="button" disabled={locked} onClick={() => { setCreating(true); setValue(type === "riji" ? creation.today() : text); setMessage(""); }}>新建{typeLabels[type]}并返回</button> : type === "jizhang" && ledgerCreation ? <button type="button" disabled={locked} onClick={() => { setCreating(true); setMessage(""); }}>新建记账并返回</button> : <p>{type === "all" ? "选择具体类型后，可新建记录并关联。" : "此类型暂不支持新建返回，请选择已有记录。"}</p>}</>}
    {creating && type === "jizhang" && ledgerCreation && <LedgerForm service={{ today: () => ledgerCreation.today(), categories: (kind) => ledgerCreation.categories(kind), prepare: (input) => ledgerCreation.prepare(currentSource, selected, input), execute: async (request) => { const result = await ledgerCreation.execute(request); acceptCreated(result); return result.id; } }} active={active} saved={() => undefined} close={() => setCreating(false)} {...(failed ? { failed } : {})} />}
    {creating && type !== "all" && type !== "jizhang" && <section aria-label="新建关联笔记"><h3>新建{typeLabels[type]}</h3><label htmlFor={`${id}-new`}>{type === "riji" ? "日期" : "笔记标题"}<input id={`${id}-new`} type={type === "riji" ? "date" : "text"} value={value} disabled={busy || creationDraft !== null} onChange={(e) => setValue(e.target.value)} /></label><p>保存后自动附加当前所有选择并返回。正文在原生编辑器继续填写。</p><button type="button" disabled={busy || creationDraft !== null} onClick={() => { setCreating(false); setValue(""); }}>取消新建</button><button type="button" disabled={busy} onClick={() => { void create(); }}>{creationDraft ? "重试新建并关联" : "保存新笔记并关联"}</button></section>}
    {result.pages > 1 && <div className="lifeos-filter-bar"><button type="button" disabled={locked || result.page <= 1} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={locked || result.page >= result.pages} onClick={() => setPage(result.page + 1)}>下一页</button></div>}
    <details className="lifeos-relation-selected"><summary>已选择 {selected.length} 条记录</summary><div className="lifeos-relation-results" role="region" aria-label="已选关联" tabIndex={0}>{selected.map((target) => { const item = search.relations(target).target; return <div className="lifeos-module-row" key={target}><span>{item ? `${typeLabels[item.type]} · ${item.title}` : `目标暂不可用：${target}`}</span><button type="button" disabled={locked} onClick={() => toggle(target)} aria-label={`移除${item?.title ?? target}`}>移除</button></div>; })}</div></details>
    <p className="lifeos-modal-status" role="status" aria-live="polite">{message}</p>{draft && !busy && <p>重试会沿用同一保存请求。需要重新选择时，请关闭后重新打开。</p>}
    <div className="lifeos-template-actions"><button type="button" disabled={busy || creating} onClick={close}>取消</button><button type="button" className="mod-cta" disabled={busy || creating} onClick={() => { void save(); }}>{busy ? "保存中…" : draft ? "重试保存" : "保存关联"}</button></div>
  </section>;
}
