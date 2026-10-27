import { rm, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "vite";
const root = new URL("../", import.meta.url);
await rm(new URL("dist/", root), { recursive: true, force: true });
const compiler = spawnSync(
  process.execPath,
  [
    createRequire(import.meta.url).resolve("typescript/bin/tsc"),
    "-p",
    "tsconfig.json",
  ],
  { cwd: root, stdio: "inherit" },
);
if (compiler.status !== 0) process.exit(compiler.status ?? 1);
const web = spawnSync(
  process.execPath,
  [
    createRequire(import.meta.url).resolve("typescript/bin/tsc"),
    "-p",
    "web/tsconfig.json",
  ],
  { cwd: root, stdio: "inherit" },
);
if (web.status !== 0) process.exit(web.status ?? 1);
await build({ configFile: new URL("vite.config.ts", root).pathname });
const pdfRoot = new URL("../", import.meta.resolve("pdfjs-dist/build/pdf.mjs"));
await cp(
  new URL("cmaps/", pdfRoot),
  new URL("dist/client/assets/pdf-cmaps/", root),
  { recursive: true },
);
await cp(
  new URL("standard_fonts/", pdfRoot),
  new URL("dist/client/assets/pdf-fonts/", root),
  { recursive: true },
);
