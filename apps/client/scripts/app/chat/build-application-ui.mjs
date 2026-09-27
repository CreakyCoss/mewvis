import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { rollup } from "rollup";
import { dts } from "rollup-plugin-dts";
import { format } from "prettier";
import ts from "typescript";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const output = resolve(desktop, "src/chat/react/dist");
await mkdir(output, { recursive: true });
await buildDeclarations(process.argv.includes("--check-types"));
if (process.argv.includes("--check-types")) process.exit(0);
const runtime = await build({
  absWorkingDir: desktop,
  entryPoints: ["src/chat/react/application-runtime.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".jpg": "dataurl", ".png": "dataurl", ".webp": "dataurl", ".svg": "dataurl" },
  metafile: true,
  outfile: resolve(output, "application-runtime.js"),
});
for (const path of Object.keys(runtime.metafile.inputs)) {
  if (/src\/(api|workbench|chat\/desktop)\/|@tauri-apps|agent-runtime\/src/.test(path))
    throw new Error(`Application UI imports host code: ${path}`);
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
await writeFile(resolve(output, "application-runtime.css"), bundledCss.outputFiles[0].text);
// Ship a development runtime with the toolchain, without a dependency on a
// checkout of desktop. React stays external so Vite and React Refresh share it.
const previewOutput = resolve(desktop, "../../packages/app/dev/dist");
await mkdir(previewOutput, { recursive: true });
await build({
  absWorkingDir: desktop,
  entryPoints: ["src/chat/react/application-runtime.ts"],
  outfile: resolve(previewOutput, "chat-ui.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["react", "react/*", "react-dom", "react-dom/*", "@isle/app-sdk/*"],
  loader: { ".jpg": "dataurl", ".png": "dataurl", ".webp": "dataurl", ".svg": "dataurl" },
});
await writeFile(resolve(previewOutput, "chat-ui.css"), bundledCss.outputFiles[0].text);
await build({
  absWorkingDir: desktop,
  entryPoints: ["scripts/app/dev/preview-host.ts"],
  outfile: resolve(previewOutput, "chat-host.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
console.log("Shared application Chat UI built from the application components; host dependency boundary passed.");

async function buildDeclarations(check) {
  const sdk = resolve(desktop, "../../packages/app/sdk/chat");
  // Read the actual SDK exports without executing the host-injected module.
  const facade = await build({
    entryPoints: [resolve(sdk, "react.js")],
    format: "esm",
    metafile: true,
    write: false,
  });
  const names = Object.values(facade.metafile.outputs)[0].exports;
  const directory = await mkdtemp(resolve(output, "types-"));
  const ui = JSON.stringify(resolve(desktop, "src/chat/react/index").replaceAll("\\", "/"));
  const application = JSON.stringify(resolve(desktop, "src/chat/react/application").replaceAll("\\", "/"));
  try {
    const entry = resolve(directory, "entry.ts");
    // Keep existing public names, deriving all fields and signatures from the implementation.
    await writeFile(
      entry,
      `${names.map((name) => `export { ${name} } from ${name === "useApplicationChatSession" ? application : ui};`).join("\n")}
export type { ChatDisplayOptions, ComposerDraft, ComposerBinding, ComposerSlots } from ${ui};
import type { ComponentProps } from "react";
import type { Chat, useChatControls } from ${ui};
export type ChatControls = ReturnType<typeof useChatControls>;
export type ChatComposerProps = ComponentProps<typeof Chat.Composer>;
export type MessagesProps = ComponentProps<typeof Chat.Messages>;
export type RenderMessage = NonNullable<MessagesProps["renderMessage"]>;
`,
    );
    const external = ["@isle/chat-contracts", "@isle/app-sdk/chat", "react", "react/jsx-runtime"];
    const bundle = await rollup({
      input: entry,
      external,
      plugins: [dts({ tsconfig: resolve(desktop, "scripts/app/chat/tsconfig.application.json") })],
    });
    let declarations;
    try {
      declarations = (await bundle.generate({ format: "es" })).output[0].code;
    } finally {
      await bundle.close();
    }
    for (const [, dependency] of declarations.matchAll(/(?:from\s+|import\()\s*["']([^"']+)["']/g))
      if (!external.includes(dependency))
        throw new Error(`Application UI declarations import a private dependency: ${dependency}`);
    const content = await format(
      `// Generated from the shared Chat implementation by pnpm build:chat-ui. Do not edit.\n${declarations}`,
      { parser: "typescript" },
    );
    // Validate the published declarations without the application's aliases or skipLibCheck.
    const validation = resolve(directory, "react.d.ts");
    await writeFile(validation, content);
    const program = ts.createProgram([validation], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      noEmit: true,
      types: [],
    });
    const errors = ts.getPreEmitDiagnostics(program);
    if (errors.length)
      throw new Error(
        ts.formatDiagnostics(errors, {
          getCanonicalFileName: (file) => file,
          getCurrentDirectory: () => desktop,
          getNewLine: () => "\n",
        }),
      );
    const destination = resolve(sdk, "react.d.ts");
    if (check) {
      if ((await readFile(destination, "utf8")) !== content)
        throw new Error("Application Chat UI declarations are stale. Run pnpm build:chat-ui.");
      console.log("Application Chat UI declarations match the shared implementation.");
    } else await writeFile(destination, content);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
