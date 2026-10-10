import { useEffect, useId, useRef, useState } from "react";
import { isRiqi } from "../domain/date";
import type { JournalDraft, JournalService } from "../services/journal-service";
export interface JournalPort { service: JournalService; openPath: (path: string) => Promise<void> }
function adjacentMonth(month: string, amount: number): string {
  const [year, value] = month.split("-").map(Number), total = year! * 12 + value! - 1 + amount, next = `${String(Math.floor(total / 12)).padStart(4, "0")}-${String(total % 12 + 1).padStart(2, "0")}`;
  return isRiqi(`${next}-01`) ? next : month;
}
export function JournalForm({ port }: { port: JournalPort }) {
  const id = useId(), [date, setDate] = useState(() => port.service.today()), [month, setMonth] = useState(() => port.service.today().slice(0, 7)), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [, refresh] = useState(0);
  const pending = useRef<{ date: string; draft: JournalDraft; path?: string } | null>(null), saving = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; const release = port.service.subscribe(() => refresh((v) => v + 1)); refresh((v) => v + 1); return () => { mounted.current = false; release(); }; }, [port]);
  const days = port.service.month(month), current = port.service.day(date), leading = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const choose = (next: string) => { if (saving.current || !isRiqi(next)) return; pending.current = null; setDate(next); setMonth(next.slice(0, 7)); setMessage(""); };
  const open = async () => {
    if (saving.current || !port.service.ready || current.status === "blocked") return;
    saving.current = true; setBusy(true); setMessage("正在打开日记…");
    try {
      if (!pending.current || pending.current.date !== date) pending.current = { date, draft: await port.service.prepare(date) };
      const request = pending.current;
      if (!request.path) request.path = await port.service.execute(request.draft);
      if (!mounted.current) return;
      await port.openPath(request.path);
      if (mounted.current) { setMessage("已在原生编辑器打开，可直接填写属性和正文。"); pending.current = null; }
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  return <section className="lifeos-journal" aria-label="日记日期浏览">
    <div className="lifeos-filter-bar"><button type="button" disabled={busy} onClick={() => choose(`${adjacentMonth(month, -1)}-01`)}>上个月</button><label htmlFor={`${id}-month`}>月份<input id={`${id}-month`} type="month" value={month} disabled={busy} onChange={(e) => choose(`${e.target.value}-01`)} /></label><button type="button" disabled={busy} onClick={() => choose(`${adjacentMonth(month, 1)}-01`)}>下个月</button><button type="button" disabled={busy} onClick={() => choose(port.service.today())}>今天</button></div>
    {port.service.issueCount > 0 && <p role="status">{port.service.issueCount} 项日记异常，请通过需核对的日期或完整性检查查看原文件。</p>}
    <div className="lifeos-journal-calendar">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day} aria-hidden="true">{day}</span>)}{Array.from({ length: leading }, (_, n) => <span key={`empty-${n}`} />)}{days.map((day) => <button type="button" key={day.date} disabled={busy || !port.service.ready} aria-pressed={date === day.date} aria-label={`${day.date} ${day.status === "ready" ? "已记录" : day.status === "blocked" ? "需核对" : "未记录"}`} onClick={() => choose(day.date)}>{Number(day.date.slice(-2))}<small>{day.status === "ready" ? "已记录" : day.status === "blocked" ? "需核对" : ""}</small></button>)}</div>
    <label htmlFor={`${id}-date`}>日记日期<input id={`${id}-date`} type="date" value={date} disabled={busy} onChange={(e) => choose(e.target.value)} /></label>
    <h3>{current.date} · {current.weekday}</h3>
    {!port.service.ready ? <p role="status">正在读取日记…</p> : current.status === "blocked" ? <><p role="alert">该日需要核对，暂停新建。</p>{current.messages.map((message, n) => <p key={n}>{message}</p>)}{current.paths.map((path) => <button type="button" key={path} onClick={() => { void port.openPath(path).catch((error: unknown) => { if (mounted.current) setMessage(String(error)); }); }}>检查原笔记：{path}</button>)}</> : <><p>{current.lunar} {current.weather || "天气未填写"} {current.tags.map((tag) => `#${tag}`).join(" ")}</p>{current.status === "ready" ? <pre className="lifeos-journal-body">{current.body || "正文尚未填写"}</pre> : <p>这一天还没有日记。</p>}<button type="button" className="mod-cta" disabled={busy || !port.service.ready} onClick={() => { void open(); }}>{busy ? "处理中…" : pending.current ? "重试打开日记" : current.status === "ready" ? "查看 / 编辑日记" : "创建并打开日记"}</button></>}
    <p role="status" aria-live="polite">{message}</p><p className="lifeos-hint">正文使用原生编辑器填写。新建文件按年-月归档；手工修改不会被浏览操作覆盖。</p>
  </section>;
}
