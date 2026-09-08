import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
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

// SRT resolves its Linux seccomp assets next to the bundled entry point.
// Include both architectures so cross-platform packaging stays portable.
const require = createRequire(import.meta.url);
const sandboxRoot = dirname(require.resolve("@anthropic-ai/sandbox-runtime/package.json"));
const vendorDir = join(runtimeRoot, "dist", "vendor");
await mkdir(vendorDir, { recursive: true });
await cp(join(sandboxRoot, "vendor", "seccomp"), join(vendorDir, "seccomp"), { recursive: true });
await cp(join(sandboxRoot, "LICENSE"), join(vendorDir, "sandbox-runtime.LICENSE"));
