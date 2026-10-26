import { rm, cp, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../", import.meta.url));
await rm(resolve(root, "dist"), { recursive: true, force: true });
const checked = spawnSync(
  process.execPath,
  [
    createRequire(import.meta.url).resolve("typescript/bin/tsc"),
    "-p",
    "tsconfig.json",
  ],
  { cwd: root, stdio: "inherit" },
);
if (checked.status !== 0) process.exit(checked.status ?? 1);
const entries = (await readdir(resolve(root, "src"), { recursive: true }))
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => resolve(root, "src", name));
await build({
  entryPoints: entries,
  outbase: resolve(root, "src"),
  outdir: resolve(root, "dist"),
  platform: "browser",
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  bundle: false,
});
await cp(resolve(root, "src/styles.css"), resolve(root, "dist/styles.css"));
