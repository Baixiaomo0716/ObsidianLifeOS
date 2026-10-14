import type { EntityIndex } from "./entity-index";
import type { TemplateService, NoteDraft } from "./template-service";
import type { KnowledgeService, KnowledgeDraft } from "./knowledge-service";
import type { Snapshot } from "../ports/entity-store";
export const inspirationTag = "灵感便签";
export class InspirationService {
  constructor(private readonly index: EntityIndex, private readonly templates: TemplateService, private readonly knowledge: KnowledgeService) {}
  subscribe(listener: () => void) { return this.index.subscribe(listener); }
  list() { return this.index.all().filter(s => s.attributes.shiti === "zhishi" && (s.attributes.biaoqian as string[]).includes(inspirationTag)).sort((a, b) => String(b.attributes.gengxinshijian).localeCompare(String(a.attributes.gengxinshijian)) || a.path.localeCompare(b.path)); }
  async prepare(text: string, source?: Snapshot): Promise<NoteDraft | KnowledgeDraft> {
    const content = text.trim();
    if (!content || content.length > 2000) throw new Error("请填写1至2000字的灵感");
    if (source) {
      if (!this.list().some(s => s.attributes.biaoshi === source.attributes.biaoshi)) throw new Error("便签已不存在，请重新打开");
      return this.knowledge.prepare(source, { fields: { neirong: content, biaoqian: source.attributes.biaoqian }, progress: (source.attributes.jindu ?? "weikaishi") as "weikaishi" | "jinxingzhong" | "yiwancheng", body: content + "\n" });
    }
    const draft = await this.templates.prepare("zhishi", `灵感-${crypto.randomUUID().slice(0, 8)}-${Array.from(content.split(/\r?\n/)[0]!).slice(0, 16).join("")}`);
    const action = draft.qingqiu.buzhou[0];
    if (!action || action.caozuoleixing !== "chuangjian") throw new Error("便签创建请求无效");
    action.jilu.biaoqian = [...new Set([...(action.jilu.biaoqian ?? []), inspirationTag])];
    action.jilu.neirong = content;
    draft.qingqiu = { ...draft.qingqiu, buzhou: [{ ...action, zhengwen: content + "\n" }] };
    return draft;
  }
  async execute(draft: NoteDraft | KnowledgeDraft) {
    if ("qingqiu" in draft) await this.templates.execute(draft); else await this.knowledge.execute(draft);
  }
}
