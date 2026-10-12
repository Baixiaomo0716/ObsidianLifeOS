import { Icon } from "./Icon";
import { PeriodReviewPage, type PeriodReviewPort } from "./PeriodReviewPage";
import { TagPage } from "./TagPage";
import { KnowledgePage, type KnowledgePort } from "./KnowledgePage";
import { TravelPage, type TravelPort } from "./TravelPage";
import { PerformancePage, type PerformancePort } from "./PerformancePage";
import { GamePage, type GamePort } from "./GamePage";
import { FilmPage, type FilmPort } from "./FilmPage";
import { ReadingPage, type ReadingPort } from "./ReadingPage";
import { HomePage, type HomePort } from "./HomePage";
import { ProjectPage, type ProjectPort } from "./ProjectPage";
import { LedgerPage, type LedgerPort } from "./LedgerPage";
import { TaskPage, type TaskPort } from "./TaskPage";
import { JournalForm, type JournalPort } from "./JournalForm";
import { ReviewPage, type ReviewPort } from "./ReviewPage";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { shiti, type Shiti } from "../domain/entities";
import type { NoteType } from "../services/note-templates";
export type Page = "home" | "record" | "review" | "settings";
export interface AppProps { periodReview?: PeriodReviewPort; knowledge?: KnowledgePort; travel?: TravelPort; performances?: PerformancePort; game?: GamePort; film?: FilmPort; reading?: ReadingPort; home?: HomePort; projects?: ProjectPort; ledger?: LedgerPort; onCreateLedger?: () => void; tasks?: TaskPort; journal?: JournalPort; review?: ReviewPort; enabledModules?: readonly Shiti[]; renderSettings?: (body: HTMLElement, footer: HTMLElement) => void; onCreateNote?: (type: NoteType) => void }
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
  return <section className="lifeos-card" aria-labelledby={id}><header className="lifeos-card-header"><h2 id={id}>{title}</h2>{title === "快速记录" && <span className="lifeos-card-caption">给今天留下一点痕迹</span>}</header><div className="lifeos-card-body" tabIndex={0} role="region" aria-label={`${title}内容`}>{children}</div></section>;
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
export function App({ enabledModules = shiti, renderSettings, onCreateNote, periodReview, knowledge, travel, performances, game, film, reading, review, journal, tasks, onCreateLedger, ledger, projects, home }: AppProps = {}) {
  const [reviewMode, setReviewMode] = useState<"records" | "tags" | "period">("records"), [page, setPage] = useState<Page>("home"), [module, setModule] = useState<Shiti | "all">("all");
  const [, refreshHome] = useState(0);
  useEffect(() => {
    if (!home || page !== "home") return;
    const refresh = () => refreshHome((n) => n + 1), unsubscribe = home.service.subscribe(refresh), timer = setInterval(refresh, 60000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [home?.service, page]);
  const summary = page === "home" ? home?.service.read() : undefined;
  const id = useId(), titleId = `lifeos-title-${id}`, contentId = `lifeos-content-${id}`;
  const active = pages.find((item) => item.id === page)!;
  const visible = modules.filter((item) => enabledModules.includes(item.id));
  return <main className={`lifeos-app lifeos-page-${page}`} aria-labelledby={titleId}>
    <aside className="lifeos-sidebar"><div className="lifeos-brand"><strong>LifeOS</strong><small>生活，一点点记录</small></div><nav className="lifeos-navigation" aria-label="LifeOS页面">{pages.map((item) => <button type="button" key={item.id} aria-current={page === item.id ? "page" : undefined} aria-controls={contentId} onClick={() => setPage(item.id)}><Icon name={item.id} /><span>{item.name}</span></button>)}</nav><p className="lifeos-sidebar-note">留给自己的生活空间</p></aside>
    <div className="lifeos-workspace"><header className="lifeos-header"><div><h1 id={titleId}>{active.name}</h1><p className="lifeos-eyebrow">{active.hint}</p></div></header>
      <div className="lifeos-page" id={contentId}>
        {page === "home" && <div className="lifeos-grid"><HomePage section="today" summary={summary} port={home} /><Card title="快速记录"><div className="lifeos-shortcuts">{visible.filter((item) => ["riji", "jizhang", "daiban"].includes(item.id)).map((item) => <button type="button" disabled={item.id === "jizhang" ? !onCreateLedger : !onCreateNote} data-type={item.id} key={item.id} onClick={() => { if (item.id === "jizhang") onCreateLedger?.(); else onCreateNote?.(item.id); }}>{item.name}<Icon name={item.id} /><strong>{{ riji: "写日记", jizhang: "记一笔", daiban: "添加待办" }[item.id as "riji" | "jizhang" | "daiban"]}</strong><small>{item.hint}</small><span aria-hidden="true">→</span></button>)}</div></Card><HomePage section="ongoing" summary={summary} port={home} /><HomePage section="recent" summary={summary} port={home} /></div>}
        {page === "record" && <div className="lifeos-grid lifeos-record-grid"><Card title="选择记录类型"><div className="lifeos-module-list">{visible.map((item) => <div className="lifeos-module-row" data-type={item.id} key={item.id}><span className="lifeos-type-icon"><Icon name={item.id} /></span><div><strong>{item.name}</strong><p>{item.hint}</p></div><button type="button" disabled={item.id === "jizhang" ? !onCreateLedger : !onCreateNote} onClick={() => { if (item.id === "jizhang") onCreateLedger?.(); else onCreateNote?.(item.id); }}>{item.id === "jizhang" ? (onCreateLedger ? "新建记账" : "表单待接入") : "新建笔记"}</button></div>)}</div>{!visible.length && <Empty title="暂无启用模块">可在设置中启用记录类型。</Empty>}</Card><Card title="记录方式"><h3>笔记与账本</h3><div className="lifeos-record-method"><Icon name="riji" /><div><h3>笔记记录</h3><p>通过模板新建笔记，在编辑器中填写。</p></div></div><div className="lifeos-record-method"><Icon name="jizhang" /><div><h3>记账记录</h3><p>通过专用表单填写，单独保存账目。</p></div></div></Card></div>}
        {page === "review" && <div className="lifeos-review-layout"><div className="lifeos-filter-bar"><label htmlFor={`module-${id}`}>记录类型</label><select id={`module-${id}`} disabled={reviewMode === "period"} value={module} onChange={(event) => setModule(event.target.value as Shiti | "all")}><option value="all">全部类型</option>{visible.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button type="button" aria-pressed={reviewMode === "records"} onClick={() => setReviewMode("records")}>记录浏览</button><button type="button" aria-pressed={reviewMode === "tags"} onClick={() => setReviewMode("tags")}>标签浏览</button><button type="button" aria-pressed={reviewMode === "period"} onClick={() => setReviewMode("period")}>月年度回顾</button></div><Card title={reviewMode === "period" ? "月年度回顾" : reviewMode === "tags" ? "标签浏览" : module === "all" ? "全部记录" : `${modules.find((item) => item.id === module)?.name ?? "记录"}记录`}>{reviewMode === "period" ? <PeriodReviewPage port={periodReview} /> : reviewMode === "tags" ? <TagPage key={module} port={review} type={module} allowed={enabledModules} /> : module === "riji" && journal ? <><JournalForm port={journal} /><h3>日记搜索与关联</h3><ReviewPage key={module} port={review} type={module} allowed={enabledModules} /></> : module === "zhishi" && knowledge ? <KnowledgePage port={knowledge} /> : module === "lvxing" && travel ? <TravelPage port={travel} /> : module === "yanchu" && performances ? <PerformancePage port={performances} /> : module === "youxi" && game ? <GamePage port={game} /> : module === "yingshi" && film ? <FilmPage port={film} /> : module === "yuedu" && reading ? <ReadingPage port={reading} /> : module === "xiangmu" && projects ? <ProjectPage port={projects} /> : module === "jizhang" && ledger ? <LedgerPage port={ledger} /> : module === "daiban" && tasks ? <TaskPage port={tasks} /> : <ReviewPage key={module} port={review} type={module} allowed={enabledModules} />}</Card></div>}
        {page === "settings" && <SettingsPanel render={renderSettings} />}
      </div><footer className="lifeos-workspace-footer"><span>留给自己的生活空间</span><span title="同步状态请在同步工具中查看">本地笔记</span></footer>
    </div>
  </main>;
}




