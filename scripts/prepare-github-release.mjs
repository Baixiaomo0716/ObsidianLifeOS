import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const [manifest, pkg, versions, built] = await Promise.all([
  readJson("manifest.json"), readJson("package.json"), readJson("versions.json"), readJson("dist/manifest.json"),
]);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "Use a numeric x.y.z release tag, without a v prefix");
assert.equal(manifest.id, "life-os");
assert.equal(pkg.version, manifest.version, "package.json version must match manifest.json");
assert.equal(versions[manifest.version], manifest.minAppVersion, "versions.json must include this version");
assert.deepEqual(built, manifest, "Rebuild before preparing release assets");
assert.equal(process.env.RELEASE_TAG ?? manifest.version, manifest.version, "Git tag must exactly match manifest.version");
assert.deepEqual(await readFile("dist/styles.css"), await readFile("styles.css"), "Rebuild the updated stylesheet");

const assets = ["main.js", "manifest.json", "styles.css"];
// Only these three built plugin files belong in an Obsidian installation.
const contents = await Promise.all(assets.map((file) => readFile(`dist/${file}`)));
contents.forEach((content) => assert.ok(content.length > 0, "Release files must not be empty"));
await mkdir("releases/github/life-os", { recursive: true });
for (const file of assets) await copyFile(`dist/${file}`, `releases/github/life-os/${file}`);
await writeFile("releases/github/SHA256SUMS.txt", contents.map((content, i) => `${createHash("sha256").update(content).digest("hex")}  ${assets[i]}`).join("\n") + "\n");
console.log(`Prepared LifeOS ${manifest.version}: releases/github/life-os/ (3 files)`);
