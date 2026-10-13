import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const bundled = await build({
  entryPoints: ["scripts/settings/model-settings.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const root = mkdtempSync(join(tmpdir(), "mewvis-model-settings-"));
try {
  const file = join(root, "tests.mjs");
  writeFileSync(file, bundled.outputFiles[0].text);
  process.exitCode = spawnSync(process.execPath, ["--test", file], { stdio: "inherit" }).status ?? 1;
} finally {
  rmSync(root, { recursive: true, force: true });
}
