import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const result = await build({
  entryPoints: ["scripts/app/chat/application.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
  metafile: true,
});
for (const input of Object.keys(result.metafile.inputs))
  if (/node_modules\/(react|lexical)|@tauri-apps|src\/workbench|src\/api\//.test(input))
    throw new Error(`Headless application boundary violation: ${input}`);
const directory = await mkdtemp(join(tmpdir(), "isle-app-chat-"));
try {
  const file = join(directory, "test.mjs");
  await writeFile(file, result.outputFiles[0].contents);
  process.exitCode = spawnSync(process.execPath, ["--test", file], { stdio: "inherit" }).status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
