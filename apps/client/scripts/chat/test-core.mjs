import { productId } from "@mewvis/product-config";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import assert from "node:assert/strict";
const boundary = await build({
  entryPoints: ["src/chat/core/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  metafile: true,
});
for (const path of Object.keys(boundary.metafile.inputs))
  assert.doesNotMatch(
    path,
    /(?:react|lexical|tauri|\.css$|chat\/desktop|workbench\/pages)/i,
    `Forbidden core dependency: ${path}`,
  );
assert.doesNotMatch(boundary.outputFiles[0].text, /\b(?:window|document|requestAnimationFrame)\b/);
const bundled = await build({
  entryPoints: ["scripts/chat/core.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const output = mkdtempSync(join(tmpdir(), productId("-chat-tests-")));
try {
  const file = join(output, "test.mjs");
  writeFileSync(file, bundled.outputFiles[0].text);
  const result = spawnSync(process.execPath, ["--test", file], { stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  rmSync(output, { recursive: true, force: true });
}
