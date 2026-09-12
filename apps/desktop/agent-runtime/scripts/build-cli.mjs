import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dshBundleCompatibilityPlugin } from "@isle/app-dev/dsh";
import entries from "../build-entries.json" with { type: "json" };

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// Runtime modules and SRT assets resolve siblings, so all entries share dist's root.
const entryPoints = Object.values(entries).map(({ source, output }) => {
  if (!/^[\w.-]+\.js$/.test(output)) throw new Error(`Runtime 入口必须是 dist 根目录下的 .js 文件：${output}`);
  return { in: join(runtimeRoot, source), out: output.slice(0, -3) };
});

await rm(join(runtimeRoot, "dist"), { recursive: true, force: true });
await build({
  entryPoints,
  // Use package exports consistently; Pi's development aliases target its sources.
  tsconfig: join(runtimeRoot, "tsconfig.json"),
  outdir: join(runtimeRoot, "dist"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: "import { createRequire as __runtimeCreateRequire } from 'node:module'; const require = __runtimeCreateRequire(import.meta.url);",
  },
  plugins: [dshBundleCompatibilityPlugin],
});

// Keep SRT's runtime assets next to the launcher; include both target architectures.
const require = createRequire(import.meta.url);
const sandboxRoot = dirname(require.resolve("@anthropic-ai/sandbox-runtime/package.json"));
const vendorDir = join(runtimeRoot, "dist", "vendor");
await mkdir(vendorDir, { recursive: true });
await cp(join(sandboxRoot, "vendor", "seccomp"), join(vendorDir, "seccomp"), { recursive: true });
await cp(join(sandboxRoot, "vendor", "srt-win"), join(vendorDir, "srt-win"), { recursive: true });
await cp(join(sandboxRoot, "vendor", "java-proxy-agent"), join(vendorDir, "java-proxy-agent"), { recursive: true });
await cp(join(sandboxRoot, "LICENSE"), join(vendorDir, "sandbox-runtime.LICENSE"));
