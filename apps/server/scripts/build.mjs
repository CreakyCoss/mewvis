import { checkBoundaries } from "./check-boundaries.mjs";
import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
checkBoundaries(fileURLToPath(new URL("../src/", import.meta.url)));
// Remove renamed modules so stale dist files cannot hide broken imports after a refactor.
rmSync(new URL("../dist/", import.meta.url), { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
