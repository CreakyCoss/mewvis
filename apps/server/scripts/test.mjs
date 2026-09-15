import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
function tests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? tests(path)
      : entry.name.endsWith(".test.mjs")
        ? [path]
        : [];
  });
}
// Real-runtime and Rust interop suites have explicit scripts and prerequisites.
const result = spawnSync(
  process.execPath,
  ["--test", ...tests(join(root, "test")).sort()],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
