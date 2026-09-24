import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const root = await mkdtemp(join(tmpdir(), "isle-decisions-test-"));
try {
  const outfile = join(root, "decisions.cjs");
  await build({
    entryPoints: [new URL("./decisions.test.ts", import.meta.url).pathname],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  const result = spawnSync(process.execPath, ["--test", outfile], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
