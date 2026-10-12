import { Icon } from "./Icon";
import { useEffect, useId, useState } from "react";
import { jinduZiduan, type Shiti } from "../domain/entities";
import { dateFields, typeLabels, type SearchService, type SearchItem } from "../services/search-service";
export interface ReviewPort { service: SearchService; open: (id: string) => void; editRelations?: (id: string) => void }
const progressNames: Record<string, string> = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
export function ReviewPage({ port, type, allowed }: { port?: ReviewPort | undefined; type: Shiti | "all"; allowed: readonly Shiti[] }) {
  const id = useId(), [text, setText] = useState(""), [tag, setTag] = useState(""), [progress, setProgress] = useState(""), [dateField, setDateField] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState(""), [page, setPage] = useState(1), [selected, setSelected] = useState(""), [, refresh] = useState(0);
  useEffect(() => {
    if (!port) return;
    const unsubscribe = port.service.subscribe(() => refresh((v) => v + 1));
    refresh((v) => v + 1); // Catch a publication between the initial render and subscription.
    return unsubscribe;
  }, [port]);
  useEffect(() => { setProgress(""); setDateField(""); setFrom(""); setTo(""); setPage(1); setSelected(""); }, [type]);
  const fields = type === "all" ? [] : dateFields[type] ?? [];
  const result = port?.service.query({ type, allowed, text, tag, progress, dateField, from, to, page });
  const relations = port && selected && result?.ready ? port.service.relations(selected) : undefined;
  const itemButton = (item: SearchItem) => <button type="button" onClick={() => port?.open(item.id)}>{typeLabels[item.type]} · {item.title}</button>;
  return <>
    <div className="lifeos-query-fields">
      <label htmlFor={`${id}-text`}>搜索标题、正文或标签<input placeholder="搜索记录标题、正文或标签" id={`${id}-text`} value={text} onChange={(e) => { setText(e.target.value); setPage(1); }} /></label>
      <label htmlFor={`${id}-tag`}>标签（精确匹配）<input id={`${id}-tag`} value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }} /></label>
      {(type === "all" || jinduZiduan(type)) && <label htmlFor={`${id}-progress`}>进度<select id={`${id}-progress`} value={progress} onChange={(e) => { setProgress(e.target.value); setPage(1); }}><option value="">全部进度</option>{Object.entries(progressNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {!!fields.length && <label htmlFor={`${id}-date`}>业务日期<select id={`${id}-date`} value={dateField || fields[0]![0]} onChange={(e) => { setDateField(e.target.value); setPage(1); }}>{fields.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}
      {(type === "all" || fields.length > 0) && <><label htmlFor={`${id}-from`}>从<input id={`${id}-from`} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label><label htmlFor={`${id}-to`}>至<input id={`${id}-to`} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label></>}
    </div>
    {type === "all" && <p className="lifeos-hint">日期按各类型首个业务日期筛选；知识没有业务日期，设置日期范围时不显示。</p>}
    {!result ? <p>请在 Obsidian 中打开回看页面。</p> : !result.ready ? <p role="status">正在读取记录索引…</p> : <>
      <p role="status">共 {result.total} 条记录{result.issues > 0 && `；${result.issues} 项索引问题已排除相关记录，可运行完整性检查查看。`}</p>
      {result.error && <p role="alert">{result.error}</p>}
      {result.items.map((item) => <article className="lifeos-module-row lifeos-review-row" data-type={item.type} key={item.id}><span className="lifeos-type-icon"><Icon name={item.type} /></span><div className="lifeos-review-title">{itemButton(item)}<p>{item.date || "未填写业务日期"} · {progressNames[item.progress ?? ""] ?? ""} {item.tags.map((tag) => `#${tag}`).join(" ")}</p></div><span className="lifeos-type-badge">{typeLabels[item.type]}</span><div className="lifeos-template-actions"><button type="button" onClick={() => port?.open(item.id)}>打开</button><button type="button" aria-expanded={selected === item.id} onClick={() => setSelected(selected === item.id ? "" : item.id)}>查看关联</button>{port?.editRelations && ["riji", "daiban"].includes(item.type) && <button type="button" onClick={() => port.editRelations?.(item.id)}>编辑关联</button>}</div></article>)}
      {!result.total && !result.error && <p>没有符合条件的记录。</p>}
      <div className="lifeos-filter-bar"><button type="button" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page} / {result.pages}</span><button type="button" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>下一页</button></div>
      {relations && <section aria-label="关联详情"><h3>{relations.target?.title ?? "记录已移除"}</h3><h4>关联到</h4>{relations.outgoing.length ? relations.outgoing.map(({ id, target }) => <p key={id}>{target ? itemButton(target) : `目标不存在、已回收或存在争议：${id}`}</p>) : <p>暂无关联。</p>}<h4>被哪些记录关联</h4>{relations.incoming.length ? relations.incoming.map((item) => <p key={item.id}>{itemButton(item)}</p>) : <p>暂无反向关联。</p>}</section>}
    </>}
  </>;
}

