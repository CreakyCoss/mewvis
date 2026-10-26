import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
rmSync(new URL("../dist/", import.meta.url), { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"],
  { cwd: new URL("../", import.meta.url), stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
