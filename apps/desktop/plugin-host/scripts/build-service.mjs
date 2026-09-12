import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dshBundleCompatibilityPlugin } from "@isle/plugin-dev/dsh";

const pluginHostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(pluginHostRoot, "..");

await build({
  entryPoints: ["service", "migrate-layout"].map((name) => join(pluginHostRoot, "src", `${name}.ts`)),
  outdir: join(desktopRoot, "agent-runtime", "dist", "plugin-host"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: "import { createRequire as __runtimeCreateRequire } from 'node:module'; const require = __runtimeCreateRequire(import.meta.url);",
  },
  plugins: [dshBundleCompatibilityPlugin],
});
