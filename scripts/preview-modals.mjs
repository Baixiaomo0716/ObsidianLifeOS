import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";

// Exercise the actual dialog components with disposable, in-memory preview data.
const obsidian = `
function decorate(el) {
  el.createEl = (tag, opts = {}) => { const child = decorate(document.createElement(tag)); if (opts.text) child.textContent = opts.text; if (opts.cls) child.className = opts.cls; for (const key of ["type", "value"]) if (opts[key]) child[key] = opts[key]; for (const [key, value] of Object.entries(opts.attr ?? {})) child.setAttribute(key, value); el.append(child); return child; };
  el.createDiv = opts => el.createEl("div", opts); el.createSpan = opts => el.createEl("span", opts); return el;
}
export class Modal {
  constructor() { this.modalEl = decorate(document.createElement("div")); this.modalEl.className = "modal"; this.modalEl.setAttribute("role", "dialog"); const close = this.modalEl.createEl("button", { text:"×", cls:"modal-close-button", attr:{"aria-label":"关闭"} }); close.onclick = () => this.close(); this.contentEl = this.modalEl.createDiv({cls:"modal-content"}); }
  open() { const cell = document.createElement("article"); cell.className = "preview-cell"; cell.append(this.modalEl); document.getElementById("preview").append(cell); }
  close() { this.onClose?.(); this.modalEl.parentElement?.remove(); }
}
export class Notice { constructor(text) { document.getElementById("notice").textContent = text; } }
export class TFile {}
export function setIcon(el, name) { const p = {"book-open":"M12 5v16 M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z", "square-check":"M4 4h16v16H4Z M8 12l3 3 5-6"}; el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="'+(p[name] ?? "M5 3h14v18H5Z M8 7h8 M8 11h8")+'"/></svg>'; }
`;
const contents = `
import { openTemplateModal } from "./src/ui/template-modal";
import { openTaskModal } from "./src/ui/task-modal";
import { openLedgerModal } from "./src/ui/ledger-modal";
import { openRelationModal } from "./src/ui/relation-modal";
const date = "2026-10-14", active = () => true, noop = () => {};
const templates = {today:()=>date, prepare:async()=>({}), execute:async()=>"预览日记.md"};
const ledger = {today:()=>date, categories:kind=>kind === "zhichu" ? ["餐饮","交通","购物"] : ["工资","其他"], prepare:async input=>input, execute:async()=>"preview-ledger"};
const items = [{id:"project",title:"LifeOS 首页优化",type:"xiangmu"},{id:"book",title:"原子习惯",type:"yuedu"},{id:"knowledge",title:"产品设计方法整理",type:"zhishi"}];
const search = {subscribe:()=>noop,query:({type,text})=>({ready:true,page:1,pages:1,items:items.filter(item=>(type==="all" || item.type===type)&&item.title.includes(text))}),relations:id=>({target:items.find(item=>item.id===id)})};
const query = new URLSearchParams(location.search), only = query.get("only");
if (query.has("dark")) document.body.classList.add("theme-dark");
if (only) document.body.classList.add("single-preview");
if (query.has("width")) document.body.style.width = query.get("width") + "px";
if (!only || only === "diary") openTemplateModal({},templates,"riji",active);
if (only === "template") openTemplateModal({},templates,query.get("type") ?? "yingshi",active);
if (!only || only === "ledger") openLedgerModal({},ledger,active,noop);
if (!only || only === "task") openTaskModal({}, {prepare:async(_,action)=>({action}),execute:async()=>{}}, {path:"待办/整理阅读笔记.md",attributes:{jindu:"jinxingzhong",yiquxiao:false}},active,noop);
if (!only || only === "relation") openRelationModal({}, {source:{attributes:{biaoshi:"self",shiti:"riji",guanlian:["book","knowledge"]}},search,service:{prepare:async(_,selected)=>({selected}),execute:async()=>{}},allowed:["xiangmu","yuedu","zhishi"],active},noop);
setTimeout(()=> { document.querySelector('.lifeos-relation-types button')?.click(); const amount = document.querySelector('[aria-label="金额（元）"]'); if (amount) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; setter.call(amount,"68.00"); amount.dispatchEvent(new Event("input",{bubbles:true})); } if (query.has("focus")) document.querySelector(query.get("focus"))?.focus(); },100);
`;
const result = await esbuild.build({ stdin: { contents, resolveDir: process.cwd(), loader: "ts" }, bundle: true, loader: { ".md": "text" }, platform: "browser", format: "iife", write: false, define: { "process.env.NODE_ENV": '"production"' }, plugins: [{name:"preview-obsidian",setup(build) {build.onResolve({filter:/^obsidian$/},()=>({path:"obsidian",namespace:"preview"}));build.onLoad({filter:/.*/,namespace:"preview"},()=>({contents:obsidian,loader:"js"}));}}] });
const css = await readFile("styles.css", "utf8"), output = path.resolve("output/modal-design");
await mkdir(output, {recursive:true});
const html = `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LifeOS 弹窗实装预览</title><style>
*{box-sizing:border-box}body{margin:0;background:#fffaf0;color:#191919;padding:28px;font-family:SimSun,serif}h1{margin:0 0 20px;font-size:32px}#preview{display:grid;grid-template-columns:1fr 1fr;gap:20px}.preview-cell{display:flex;align-items:center;justify-content:center;min-height:480px;padding:30px 20px;border:1px solid #191919;border-radius:14px;background:linear-gradient(#19191988,#19191988),url('../home-design/首页三列灵感便签效果图.png') center/cover}.modal{position:relative;display:flex;flex-direction:column}.modal-content{flex:1;min-height:0}.modal-close-button{position:absolute;border:0!important;background:none!important;padding:0!important;min-height:24px!important;width:24px;font-size:24px!important}.theme-dark{background:#161611;color:#f7eedf}.single-preview #preview{display:block}.single-preview .preview-cell{min-height:calc(100dvh - 110px)}#notice{margin-top:16px}@media(max-width:700px){body{padding:12px}h1{font-size:24px}#preview{grid-template-columns:1fr}.preview-cell{padding:16px 0;min-height:0}.single-preview .preview-cell{min-height:calc(100dvh - 90px)}}
${css}</style><h1>LifeOS · 弹窗实装预览</h1><main id="preview"></main><p id="notice" role="status"></p><script>${result.outputFiles[0].text.replace(/<\/script/gi,"<\\/script")}</script></html>`;
await writeFile(path.join(output,"index.html"),html,"utf8");
console.log(path.join(output,"index.html"));
