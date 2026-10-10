import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import * as esbuild from "esbuild";
import { mobileDependencyGuard } from "./build-policy.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const [pkg, manifest, bundledManifest, versions, metadata, bundle] = await Promise.all([
  readJson("package.json"),
  readJson("manifest.json"),
  readJson("dist/manifest.json"),
  readJson("versions.json"),
  readJson("dist/build-meta.json"),
  readFile("dist/main.js", "utf8"),
]);
assert.equal(manifest.version, pkg.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.equal(manifest.isDesktopOnly, false);
assert.deepEqual(bundledManifest, manifest);
assert.deepEqual((await readdir("dist")).sort(), ["build-meta.json", "main.js", "manifest.json", "styles.css"]);
assert.deepEqual(await readFile("dist/styles.css"), await readFile("styles.css"));
assert.ok(!bundle.includes("sourceMappingURL"), "Production bundle must not embed a source map");

// Validate actual bundle inputs, including transitive packages, rather than the source entry alone.
for (const path of Object.keys(metadata.inputs)) {
  if (/^templates\/(日记|阅读|影视|游戏|演出|旅行|知识|待办|项目)\.md$/.test(path)) continue;
  assert.ok(/^(src\/|node_modules\/)/.test(path), `Unexpected bundle input: ${path}`);
  assert.ok(!/\.(md|html|json)$/.test(path) || path.startsWith("node_modules/"), `Private data input: ${path}`);
}
const imports = Object.values(metadata.outputs).flatMap((output) => output.imports);
assert.ok(imports.some((item) => item.external && item.path === "obsidian"));
assert.ok(imports.every((item) => !item.external || item.path === "obsidian"), "Unexpected runtime external dependency");

// A host-contract smoke check, not a real Obsidian loading test.
class PluginStub {}
class ItemViewStub {}
class SettingTabStub {}
const pluginModule = { exports: {} };
vm.runInNewContext(bundle, {
  module: pluginModule,
  exports: pluginModule.exports,
  require(name) {
    assert.equal(name, "obsidian");
    return { Plugin: PluginStub, ItemView: ItemViewStub, PluginSettingTab: SettingTabStub };
  },
});
assert.equal(typeof pluginModule.exports.default, "function");
assert.ok(pluginModule.exports.default.prototype instanceof PluginStub);

// Negative probes ensure desktop imports fail even when introduced in future dependencies.
for (const name of ["node:fs", "path", "electron"]) {
  await assert.rejects(
    esbuild.build({
      stdin: { contents: `import ${JSON.stringify(name)};`, loader: "js" },
      bundle: true,
      write: false,
      platform: "browser",
      logLevel: "silent",
      plugins: [mobileDependencyGuard()],
    }),
    /Mobile plugin cannot import desktop module/,
  );
}
console.log("PASS: package/manifest versions, release files, allowed inputs, external host API, bundle export and 3 desktop-import rejection probes.");
