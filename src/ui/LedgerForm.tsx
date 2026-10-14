import { useRef, useState } from "react";
import type { LedgerService, LedgerDraft, LedgerInput } from "../services/ledger-service";
import { isRiqi, xingqi } from "../domain/date";
import { ModalHeader } from "./ModalHeader";
export interface LedgerFormProps { service: Pick<LedgerService, "today" | "categories" | "execute"> & { prepare: (input: LedgerInput) => LedgerDraft | Promise<LedgerDraft> }; initial?: LedgerInput; active: () => boolean; saved: (id: string) => void; close: () => void; failed?: (message: string) => void }
export function LedgerForm({ service, active, saved, close, failed, initial }: LedgerFormProps) {
  const [date, setDate] = useState(initial?.date ?? service.today()), [kind, setKind] = useState<LedgerInput["kind"]>(initial?.kind ?? "zhichu"), [category, setCategory] = useState(initial?.category ?? service.categories("zhichu")[0] ?? ""), [amount, setAmount] = useState(initial?.amount ?? ""), [tags, setTags] = useState(initial?.tags.join("，") ?? ""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [draft, setDraft] = useState<LedgerDraft | null>(null);
  const saving = useRef(false), locked = busy || draft !== null;
  const save = async () => {
    if (saving.current || !active()) return; saving.current = true; setBusy(true);
    try { const request = draft ?? await service.prepare({ date, kind, category, amount, tags: tags.split(/[,，\n]/).map((v) => v.trim()).filter(Boolean) }); if (active()) setDraft(request); const id = await service.execute(request); saved(id); }
    catch (error) { const text = error instanceof Error ? error.message : String(error); if (active()) setMessage(text); else failed?.(text); }
    finally { saving.current = false; if (active()) setBusy(false); }
  };
  const changeKind = (value: LedgerInput["kind"]) => { setKind(value); setCategory(service.categories(value)[0] ?? ""); };
  return <section className="lifeos-ledger-form" aria-label={initial ? "编辑记账" : "新建记账"}>
    <ModalHeader title={initial ? "编辑记账" : "记一笔"} subtitle="记录收支，管理生活" icon="wallet" />
    <div className="lifeos-ledger-kind" role="group" aria-label="收入 / 支出">
      <button type="button" data-kind="shouru" aria-pressed={kind === "shouru"} disabled={locked} onClick={() => changeKind("shouru")}>↑ 收入</button>
      <button type="button" data-kind="zhichu" aria-pressed={kind === "zhichu"} disabled={locked} onClick={() => changeKind("zhichu")}>↓ 支出</button>
    </div>
    <label className="lifeos-modal-field lifeos-ledger-amount" data-kind={kind}>金额（元）<span><span aria-hidden="true">¥</span><input aria-label="金额（元）" type="text" inputMode="decimal" placeholder="0.00" value={amount} disabled={locked} onChange={(e) => setAmount(e.target.value)} /></span></label>
    <div className="lifeos-ledger-details">
      <label className="lifeos-modal-field">日期<input type="date" value={date} disabled={locked} onChange={(e) => setDate(e.target.value)} /><small>{isRiqi(date) ? xingqi(date) : "请填写有效日期"}</small></label>
      <label className="lifeos-modal-field">分类<select value={category} disabled={locked} onChange={(e) => setCategory(e.target.value)}><option value="">请选择分类</option>{[...new Set([...service.categories(kind), ...(initial?.kind === kind ? [initial.category] : [])])].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <label className="lifeos-modal-field lifeos-modal-inline-field">标签<input value={tags} disabled={locked} placeholder="例如：午餐，日常" onChange={(e) => setTags(e.target.value)} /></label>
    <p className="lifeos-modal-status" role="status" aria-live="polite">{message}</p>{draft && <p className="lifeos-modal-hint">重试沿用同一笔记录。修改内容请关闭后核对账本，再重新填写。</p>}
    <div className="lifeos-template-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button type="button" className="mod-cta" disabled={busy} onClick={() => { void save(); }}>{draft ? "重试保存" : "保存记账"}</button></div>
  </section>;
}
