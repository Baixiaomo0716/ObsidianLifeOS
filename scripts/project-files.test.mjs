import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import * as esbuild from "esbuild";
const require = createRequire(import.meta.url), build = await esbuild.build({ entryPoints: ["src/ui/ProjectFiles.tsx"], bundle: true, format: "cjs", platform: "browser", external: ["react", "react/jsx-runtime"], write: false });
function fixture() {
  const states = [], refs = [], effects = []; let cursor = 0, refCursor = 0, clean, uploaded;
  const fake = { ...React, useState(initial) { const n = cursor++; if (!(n in states)) states[n] = initial; return [states[n], value => states[n] = typeof value === "function" ? value(states[n]) : value]; }, useRef(initial) { const n = refCursor++; return refs[n] ??= { current: initial }; }, useEffect(fn) { effects.push(fn); } };
  const module = { exports: {} }; vm.runInNewContext(build.outputFiles[0].text, { module, exports: module.exports, require: name => name === "react" ? fake : require(name) });
  let resolve; const pending = new Promise(r => resolve = r), source = { path: "项目.md", version: { original: "raw" }, attributes: { biaoshi: "p" } }, port = { active: () => true, upload: id => uploaded = id, open: async () => {}, service: { list: () => pending } };
  const render = () => { cursor = 0; refCursor = 0; return module.exports.ProjectFiles({ source, port }); }, walk = n => !n || typeof n !== "object" ? [] : [n, ...React.Children.toArray(n.props?.children).flatMap(walk)];
  const nodes = () => walk(render()); nodes(); clean = effects.shift()();
  return { nodes, states, resolve, clean, uploaded: () => uploaded };
}
test("project file upload routes project ID and loaded files expose bounded list", async () => {
  const f = fixture(); f.nodes().find(n => n.props.children === "上传文件").props.onClick(); assert.equal(f.uploaded(), "p");
  f.resolve([{ path: "附件.pdf", error: "文件缺失" }]); await new Promise(resolve => setImmediate(resolve));
  const list = f.nodes().find(n => n.props["aria-label"] === "附件列表"); assert.equal(list.props.className, "lifeos-relation-results"); assert.equal(list.props.children[0][0].props.row.error, "文件缺失");
});
test("closed file panel ignores late verification result", async () => {
  const f = fixture(); f.clean(); f.resolve([{ path: "旧项目.pdf" }]); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.states[0].length, 0); assert.equal(f.states[1], true);
});