import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dshBundleCompatibilityPlugin } from "../../agent-runtime/scripts/esbuild-dsh.mjs";

const pluginHostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(pluginHostRoot, "..");

await build({
  entryPoints: [join(pluginHostRoot, "src", "service.ts")],
  outfile: join(desktopRoot, "agent-runtime", "dist", "plugin-host", "service.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: "import { createRequire as __runtimeCreateRequire } from 'node:module'; const require = __runtimeCreateRequire(import.meta.url);",
  },
  plugins: [dshBundleCompatibilityPlugin],
});
