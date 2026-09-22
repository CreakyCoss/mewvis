import { build } from "esbuild";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const temp = await mkdtemp(join(tmpdir(), "isle-ui-slot-test-"));
try {
  const tests = (await readdir(new URL(".", import.meta.url))).filter((file) => /\.test\.tsx?$/.test(file));
  await build({
    entryPoints: tests.map((file) => fileURLToPath(new URL(file, import.meta.url))),
    outdir: temp,
    outExtension: { ".js": ".cjs" },
    bundle: true,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
  });
  const result = spawnSync(
    process.execPath,
    ["--test", ...tests.map((file) => join(temp, file.replace(/\.tsx?$/, ".cjs")))],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}
