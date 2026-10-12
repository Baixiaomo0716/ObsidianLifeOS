export interface LayoutResult { width: number; height: number; problems: string[]; regions: { name: string; width: number; height: number; contentHeight: number; verticalScroll: boolean }[] }
export function inspectLayout(root: HTMLElement): LayoutResult {
  const view = root.ownerDocument.defaultView;
  if (!view) throw new Error("当前窗口不可用");
  const bounds = root.getBoundingClientRect(), result: LayoutResult = { width: Math.round(bounds.width), height: Math.round(bounds.height), problems: [], regions: [] };
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error("LifeOS页面当前不可见，请先打开页面再检查");
  if (bounds.width < 320) result.problems.push("当前宽度小于320px设计基线，请扩大分栏后复测");
  if (root.scrollWidth > root.clientWidth + 2) result.problems.push("工作台出现横向溢出");
  const page = root.querySelector<HTMLElement>(".lifeos-page");
  if (page && page.scrollWidth > page.clientWidth + 2) result.problems.push("页面出现横向溢出");
  for (const region of root.querySelectorAll<HTMLElement>(".lifeos-card-body, .lifeos-relation-results, .lifeos-journal-body")) {
    const style = view.getComputedStyle(region), scroll = ["auto", "scroll"].includes(style.overflowY), name = region.getAttribute("aria-label") ?? region.className;
    result.regions.push({ name, width: region.clientWidth, height: region.clientHeight, contentHeight: region.scrollHeight, verticalScroll: scroll });
    if (region.scrollHeight > region.clientHeight + 2 && !scroll) result.problems.push(`${name}内容超过高度但未开放纵向滚动`);
    if (region.scrollWidth > region.clientWidth + 2 && !["auto", "scroll"].includes(style.overflowX)) result.problems.push(`${name}内容横向超出且不可滚动`);
  }
  if (bounds.width <= 680) for (const button of root.querySelectorAll<HTMLElement>(".lifeos-navigation button")) {
    if (button.getBoundingClientRect().height < 48) result.problems.push(`导航“${button.textContent?.trim()}”高度小于48px`);
  }
  return result;
}
export function layoutReport(result: LayoutResult): string {
  return [`当前工作台：${result.width} × ${result.height}px`, "检查仅覆盖当前已渲染页面，不自动切页、不写业务数据。", "", ...result.problems.map((problem) => `需核对：${problem}`), ...(result.problems.length ? [] : ["当前检查范围未发现框架溢出问题。"]), "", ...result.regions.map((region) => `${region.name}：${region.width} × ${region.height}px，内容高${region.contentHeight}px，纵向滚动${region.verticalScroll ? "已开放" : "未开放"}`), "", "仍需人工检查：滚到末尾、保存按钮、Tab/Enter焦点、深浅主题、弹窗、软键盘及跨页选择保留。桌面检查不代表手机验收。"].join("\n");
}
