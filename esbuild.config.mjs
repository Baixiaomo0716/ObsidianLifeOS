import * as esbuild from "esbuild";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { mobileDependencyGuard } from "./scripts/build-policy.mjs";

const watch = process.argv.includes("--watch");
const install = process.argv.includes("--vault");
const pluginDir = "dev-vault/.obsidian/plugins/life-os";
await mkdir("dist", { recursive: true });
for (const name of ["manifest.json", "styles.css"]) {
  await copyFile(name, `dist/${name}`);
}

const options = {
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2021",
  treeShaking: true,
  loader: { ".md": "text" },
  minify: !watch,
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  sourcemap: watch ? "inline" : false,
  metafile: true,
  logLevel: "info",
  plugins: [
    mobileDependencyGuard(),
    {
      name: "lifeos-build-report",
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length === 0 && result.metafile) {
            await writeFile("dist/build-meta.json", JSON.stringify(result.metafile, null, 2));
            if (install) {
              await mkdir(pluginDir, { recursive: true });
              for (const name of ["main.js", "manifest.json", "styles.css"]) {
                await copyFile(name === "main.js" ? "dist/main.js" : name, `${pluginDir}/${name}`);
              }
              console.log("LifeOS 已更新到 dev-vault；在 Obsidian 中重新加载即可查看。");
            }
          }
        });
      },
    },
  ],
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  // Include the standalone stylesheet and manifest in watch-mode rebuilds.
  const { watchFile } = await import("node:fs");
  for (const name of ["styles.css", "manifest.json"]) {
    watchFile(name, { interval: 500 }, () => {
      void context.rebuild().catch((error) => console.error(error));
    });
  }
} else {
  await esbuild.build(options);
}
