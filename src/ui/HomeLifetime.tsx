import { useId } from "react";
import type { HomeSummary } from "../services/summary-service";
import { Icon } from "./Icon";

export function HomeLifetime({ summary, connected }: { summary?: HomeSummary | undefined; connected: boolean }) {
  const id = useId(), data = summary?.ready ? summary.lifetime : undefined;
  const metrics = [
    { label: "已记录", icon: "calendar", value: data?.days, unit: "天", hint: "有记录的日期去重统计" },
    { label: "创建笔记", icon: "record", value: data?.notes, unit: "篇", hint: "当前有效的 LifeOS 笔记，含归档，不含账目和附件" },
    { label: "完成项目", icon: "flag", value: data?.projects, unit: "个", hint: "已完成项目，含归档，排除取消项目" },
    { label: "完成待办", icon: "daiban", value: data?.tasks, unit: "项", hint: "已完成待办笔记，含归档，不含正文勾选项" },
    { label: "读完书籍", icon: "yuedu", value: data?.books, unit: "本", hint: "阅读状态为已完成的书籍，含归档" },
    { label: "知识积累", icon: "zhishi", value: data?.knowledge, unit: "篇", hint: "当前有效的知识笔记，含归档" },
  ];
  return <section className="lifeos-lifetime" aria-labelledby={id}>
    <header><div><h2 id={id}>生活累计</h2></div></header>
    <div className="lifeos-lifetime-metrics">{metrics.map(metric => <div key={metric.label} title={metric.hint}><span><Icon name={metric.icon} />{metric.label}</span><strong>{metric.value ?? "—"}{metric.value !== undefined && <small>{metric.unit}</small>}</strong>{data && metric.value === undefined && <small>未启用</small>}</div>)}</div>
    <div className="lifeos-lifetime-strip" role="status"><span className="lifeos-lifetime-dot" aria-hidden="true" />{data ? <><span>连续记录 {data.streak} 天</span><span>本周小结：新增 {data.newThisWeek} 篇</span>{summary?.week?.tasks !== undefined && <span>完成 {summary.week.tasks} 项待办</span>}{summary?.week?.books !== undefined && <span>读完 {summary.week.books} 本书</span>}</> : <span>{connected ? "正在读取真实记录…" : "数据尚未接入。"}</span>}</div>
    {!!summary?.issues && <p className="lifeos-lifetime-issues" role="status">{summary.issues} 项索引问题；仅统计有效记录，请核对原文件。</p>}
  </section>;
}
