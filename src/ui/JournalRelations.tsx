import type { JournalContextService } from "../services/journal-context-service";
import { typeLabels } from "../services/search-service";
import { fenToYuan } from "../domain/money";
export interface JournalRelationsPort { service: JournalContextService; open: (id: string) => void; edit: (id: string) => void }
export function JournalRelations({ date, sourceId, port }: { date: string; sourceId?: string | undefined; port: JournalRelationsPort }) {
  const data = port.service.read(date, sourceId);
  if (!data.ready) return <p>正在读取当天记录…</p>;
  return <section aria-label="日记关联记录"><h3>当天自动汇总</h3><p>按新增、活动、日程和完成日期汇总，只读展示，不自动写入关联。</p>
    {data.moneyError ? <p role="alert">当日收支暂不可统计：{data.moneyError}</p> : <p>按账本日期：收入 ¥{fenToYuan(data.totals.shouru)} · 支出 ¥{fenToYuan(data.totals.zhichu)} · 结余 ¥{fenToYuan(data.totals.jieyu)}</p>}
    <div className="lifeos-relation-results" role="region" aria-label="自动汇总记录" tabIndex={0}>{data.automatic.length ? data.automatic.map((item) => <div className="lifeos-module-row" key={item.id}><button type="button" onClick={() => port.open(item.id)}>{typeLabels[item.type]} · {item.title}</button><small>{item.reasons.join("、")}{item.explicit && " · 已显式关联"}</small></div>) : <p>当天暂无相关记录。</p>}</div>
    <h3>显式关联</h3>{sourceId ? <button type="button" onClick={() => port.edit(sourceId)}>选择关联 / 新建并返回</button> : <p>创建有效日记后，可保存显式关联。</p>}
    <div className="lifeos-relation-results" role="region" aria-label="显式关联记录" tabIndex={0}>{data.explicit.length ? data.explicit.map((item) => <p key={item.id}>{item.title && item.type ? <button type="button" onClick={() => port.open(item.id)}>{typeLabels[item.type]} · {item.title}</button> : `关联目标暂不可用：${item.id}`}</p>) : <p>尚未选择显式关联。</p>}</div>
  </section>;
}
