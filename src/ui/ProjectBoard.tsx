import { useState } from "react";
import type { Jindu } from "../domain/entities";
import type { ProjectPort } from "./ProjectPage";
const names = { weikaishi: "未开始", jinxingzhong: "进行中", yiwancheng: "已完成" };
export function ProjectBoard({ port, text, select }: { port: ProjectPort; text: string; select: (id: string) => void }) {
  const [pages, setPages] = useState<Partial<Record<Jindu, number>>>({}), [includeInactive, setIncludeInactive] = useState(false);
  const board = port.service.board(text, pages, includeInactive);
  return <section aria-label="项目看板"><label><input type="checkbox" checked={includeInactive} onChange={e => { setIncludeInactive(e.target.checked); setPages({}); }} />包含已取消和已归档项目</label>
    {!board.ready ? <p>正在读取看板…</p> : <><p role="status">共 {board.total} 个项目；{board.issues} 项索引问题。</p><div className="lifeos-project-board">{board.columns.map(column => <section key={column.progress} className="lifeos-board-column" aria-label={`${names[column.progress]}项目`}><h3>{names[column.progress]} · {column.total}</h3><div className="lifeos-board-items" role="region" aria-label={`${names[column.progress]}项目列表`} tabIndex={0}>{column.items.map(row => <article className="lifeos-board-item" key={String(row.attributes.biaoshi)}><button type="button" onClick={() => select(String(row.attributes.biaoshi))}>{row.path.split("/").pop()?.replace(/\.md$/i, "")}</button><p>截止：{String(row.attributes.jiezhiriqi ?? "未填写")}</p>{row.attributes.yiquxiao === true && <p>已取消</p>}{row.attributes.yiguidang === true && <p>已归档</p>}</article>)}{!column.total && <p>暂无项目。</p>}</div><div className="lifeos-template-actions"><button type="button" disabled={column.page <= 1} onClick={() => setPages(p => ({ ...p, [column.progress]: column.page - 1 }))}>上一页</button><span>{column.page} / {column.pages}</span><button type="button" disabled={column.page >= column.pages} onClick={() => setPages(p => ({ ...p, [column.progress]: column.page + 1 }))}>下一页</button></div></section>)}</div><p>选择卡片查看详情，在详情中编辑或关闭、重开项目。</p></>}
  </section>;
}
