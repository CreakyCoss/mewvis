import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dshBundleCompatibilityPlugin } from "@mewvis/app-dev/dsh";

const applicationHostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: ["service", "migrate-layout"].map((name) =>
    join(applicationHostRoot, "src", `${name}.ts`),
  ),
  outdir: join(applicationHostRoot, "dist"),
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
