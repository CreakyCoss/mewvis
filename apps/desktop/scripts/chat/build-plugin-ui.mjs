import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(desktop, "src/chat/react/dist");
await mkdir(output, { recursive: true });
const runtime = await build({
  absWorkingDir: desktop,
  entryPoints: ["src/chat/react/plugin-runtime.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".jpg": "dataurl", ".png": "dataurl", ".svg": "dataurl" },
  metafile: true,
  outfile: resolve(output, "plugin-runtime.js"),
});
for (const path of Object.keys(runtime.metafile.inputs)) {
  if (/src\/(api|features|chat\/desktop)\/|@tauri-apps|agent-runtime\/src/.test(path))
    throw new Error(`Plugin UI imports host code: ${path}`);
}
// Use the application stylesheet and embed fonts for the sandbox's data-only CSP.
const css = await postcss([tailwind({ base: desktop })]).process(
  await readFile(resolve(desktop, "src/App.css"), "utf8"),
  { from: resolve(desktop, "src/App.css") },
);
const bundledCss = await build({
  absWorkingDir: desktop,
  stdin: { contents: css.css, loader: "css", resolveDir: resolve(desktop, "src") },
  bundle: true,
  minify: true,
  write: false,
  loader: { ".woff2": "dataurl", ".woff": "dataurl" },
});
await writeFile(resolve(output, "plugin-runtime.css"), bundledCss.outputFiles[0].text);
console.log("Shared plugin Chat UI built from the application components; host dependency boundary passed.");
