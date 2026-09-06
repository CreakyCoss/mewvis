import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dshBundleCompatibilityPlugin } from "@isle/plugin-dev/dsh";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [join(runtimeRoot, "src", "cli", "index.ts")],
  outfile: join(runtimeRoot, "dist", "cli.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: "import { createRequire as __runtimeCreateRequire } from 'node:module'; const require = __runtimeCreateRequire(import.meta.url);",
  },
  plugins: [dshBundleCompatibilityPlugin],
});
