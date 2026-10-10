import { builtinModules } from "node:module";

const desktopModules = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  "electron",
]);

// Build tooling may use Node; code in the bundled mobile plugin may not.
export function mobileDependencyGuard() {
  return {
    name: "lifeos-mobile-dependency-guard",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        const normalized = args.path.replace(/^node:/, "");
        if (desktopModules.has(args.path) || desktopModules.has(normalized)) {
          return {
            errors: [{ text: `Mobile plugin cannot import desktop module: ${args.path}` }],
          };
        }
        if (args.path === "obsidian") return { path: args.path, external: true };
        return undefined;
      });
    },
  };
}
