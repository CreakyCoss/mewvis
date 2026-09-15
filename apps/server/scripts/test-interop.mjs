import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const [program, args] of [
  [
    "cargo",
    [
      "build",
      "--locked",
      "--manifest-path",
      "test/integration/rust/Cargo.toml",
      "--target-dir",
      "../desktop/src-tauri/target/server-interop",
    ],
  ],
  [process.execPath, ["--test", "test/integration/storage.interop.mjs"]],
]) {
  const result = spawnSync(program, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
