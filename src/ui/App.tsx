import { JournalForm, type JournalPort } from "./JournalForm";
import { ReviewPage, type ReviewPort } from "./ReviewPage";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { shiti, type Shiti } from "../domain/entities";
import type { NoteType } from "../services/note-templates";
export type Page = "home" | "record" | "review" | "settings";
export interface AppProps { journal?: JournalPort; review?: ReviewPort; enabledModules?: readonly Shiti[]; renderSettings?: (body: HTMLElement, footer: HTMLElement) => void; onCreateNote?: (type: NoteType) => void }
const pages: { id: Page; name: string; symbol: string; hint: string }[] = [
  { id: "home", name: "首页", symbol: "⌂", hint: "把今天的生活放在一起" },
  { id: "record", name: "记录", symbol: "＋", hint: "为每一种生活记录留好位置" },
  { id: "review", name: "回看", symbol: "▦", hint: "慢慢整理，随时回顾" },
  { id: "settings", name: "设置", symbol: "⚙", hint: "让记录方式适合你" },
];
const modules: { id: Shiti; name: string; hint: string }[] = [
  { id: "riji", name: "日记", hint: "天气、心情与今天的片段" }, { id: "jizhang", name: "记账", hint: "收入与支出，独立表单记录" },
  { id: "daiban", name: "待办", hint: "记下要做的事" }, { id: "xiangmu", name: "项目", hint: "组织待办和项目文档" },
  { id: "yuedu", name: "阅读", hint: "书籍、阅读进度与感想" }, { id: "yingshi", name: "影视", hint: "电影、剧集与观看评价" },
  { id: "youxi", name: "游戏", hint: "想玩、在玩与完成的游戏" }, { id: "yanchu", name: "演出", hint: "现场、乐队与回忆" },
  { id: "lvxing", name: "旅行", hint: "行程与旅途中的发现" }, { id: "zhishi", name: "知识", hint: "积累想法与可复用的知识" },
];
function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return <section className="lifeos-card" aria-labelledby={id}><header className="lifeos-card-header"><h2 id={id}>{title}</h2></header><div className="lifeos-card-body" tabIndex={0} role="region" aria-label={`${title}内容`}>{children}</div></section>;
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="lifeos-empty"><strong>{title}</strong><p>{children}</p></div>;
}
function SettingsPanel({ render }: { render: AppProps["renderSettings"] }) {
  const body = useRef<HTMLDivElement>(null), footer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const content = body.current, actions = footer.current;
    if (!content || !actions || !render) return;
    render(content, actions);
    return () => { content.replaceChildren(); actions.replaceChildren(); };
  }, [render]);
  return <section className="lifeos-card lifeos-settings-card" aria-label="LifeOS配置"><header className="lifeos-card-header"><h2>使用偏好</h2><span>保存后重新加载生效</span></header><div className="lifeos-card-body" ref={body}>{!render && <Empty title="设置预览">配置可在 Obsidian 的 LifeOS 设置页修改。</Empty>}</div><div className="lifeos-card-footer" ref={footer} /></section>;
}
export function App({ enabledModules = shiti, renderSettings, onCreateNote, review, journal }: AppProps = {}) {
  const [page, setPage] = useState<Page>("home"), [module, setModule] = useState<Shiti | "all">("all");
  const id = useId(), titleId = `lifeos-title-${id}`, contentId = `lifeos-content-${id}`;
  const active = pages.find((item) => item.id === page)!;
  const visible = modules.filter((item) => enabledModules.includes(item.id));
  return <main className="lifeos-app" aria-labelledby={titleId}>
    <aside className="lifeos-sidebar"><div className="lifeos-brand"><span>◒</span><strong>LifeOS</strong><small>生活，一点点记录</small></div><nav className="lifeos-navigation" aria-label="LifeOS页面">{pages.map((item) => <button type="button" key={item.id} aria-current={page === item.id ? "page" : undefined} aria-controls={contentId} onClick={() => setPage(item.id)}><span aria-hidden="true">{item.symbol}</span><span>{item.name}</span></button>)}</nav><p className="lifeos-sidebar-note">留给自己的生活空间</p></aside>
    <div className="lifeos-workspace"><header className="lifeos-header"><div><p className="lifeos-eyebrow">{active.hint}</p><h1 id={titleId}>{active.name}</h1></div><span className="lifeos-stage">开发预览</span></header>
      <div className="lifeos-page" id={contentId}>
        {page === "home" && <div className="lifeos-grid"><Card title="今天"><Empty title="工作台已就绪">日记、收支与待办将在对应模块完成后显示。</Empty></Card><Card title="快速记录"><div className="lifeos-shortcuts">{visible.filter((item) => ["riji", "jizhang", "daiban"].includes(item.id)).map((item) => <button type="button" disabled={item.id === "jizhang" || !onCreateNote} key={item.id} onClick={() => { if (item.id !== "jizhang") onCreateNote?.(item.id); }}>{item.name}<small>{item.id === "jizhang" ? "表单待接入" : "新建笔记"}</small></button>)}</div><p className="lifeos-hint">九类内容将通过笔记模板录入；记账使用专用表单。</p></Card><Card title="进行中事项"><Empty title="给正在推进的事情一个位置">这里只展示进行中的待办、项目、阅读、影视、游戏、演出与旅行。模块数据接入后显示。</Empty></Card><Card title="最近记录"><Empty title="生活的片段会留在这里">最近动态与真实记录将在后续模块接入。</Empty></Card></div>}
        {page === "record" && <div className="lifeos-grid lifeos-record-grid"><Card title="选择记录类型"><div className="lifeos-module-list">{visible.map((item) => <div className="lifeos-module-row" key={item.id}><div><strong>{item.name}</strong><p>{item.hint}</p></div><button type="button" disabled={item.id === "jizhang" || !onCreateNote} onClick={() => { if (item.id !== "jizhang") onCreateNote?.(item.id); }}>{item.id === "jizhang" ? "表单待接入" : "新建笔记"}</button></div>)}</div>{!visible.length && <Empty title="暂无启用模块">可在设置中启用记录类型。</Empty>}</Card><Card title="记录方式"><Empty title="笔记与账本，各有自己的位置">日记、阅读、影视、游戏、演出、旅行、知识、待办与项目通过 Markdown 模板填写。记账保存在独立数据表。</Empty><p className="lifeos-hint">九类笔记可新建并在原生编辑器填写，记账表单仍待接入。</p></Card></div>}
        {page === "review" && <div className="lifeos-review-layout"><div className="lifeos-filter-bar"><label htmlFor={`module-${id}`}>记录类型</label><select id={`module-${id}`} value={module} onChange={(event) => setModule(event.target.value as Shiti | "all")}><option value="all">全部类型</option>{visible.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><span>搜索与关联查询</span></div><Card title={module === "all" ? "全部记录" : `${modules.find((item) => item.id === module)?.name ?? "记录"}记录`}>{module === "riji" && journal ? <><JournalForm port={journal} /><h3>日记搜索与关联</h3><ReviewPage key={module} port={review} type={module} allowed={enabledModules} /></> : <ReviewPage key={module} port={review} type={module} allowed={enabledModules} />}</Card></div>}
        {page === "settings" && <SettingsPanel render={renderSettings} />}
      </div><footer className="lifeos-workspace-footer">本地笔记 · 同步状态请在同步工具中查看</footer>
    </div>
  </main>;
}




