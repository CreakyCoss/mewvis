import ts from "typescript";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { validateApplication } from "./tooling.mjs";
import { browserBoundary, uiSource, hostSource } from "./project.mjs";

export async function checkApplication(source) {
  const { root, project, manifest } = await validateApplication(source);
  if (!project) return;
  const require = createRequire(import.meta.url);
  const configPath = ts.findConfigFile(
    root,
    ts.sys.fileExists,
    "tsconfig.json",
  );
  let projectOptions = {};
  if (configPath && dirname(configPath) === root) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error)
      throw new Error(
        ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
      );
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    if (parsed.errors.length)
      throw new Error(
        parsed.errors
          .map((error) =>
            ts.flattenDiagnosticMessageText(error.messageText, "\n"),
          )
          .join("\n"),
      );
    projectOptions = parsed.options;
  }
  const options = {
    ...projectOptions,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    typeRoots: [
      join(root, "node_modules/@types"),
      resolve(dirname(require.resolve("@types/node/package.json")), ".."),
    ],
  };
  const groups = [
    {
      files: [
        join(root, "isle.config.ts"),
        ...(project.hostEntry ? [project.hostEntry] : []),
        ...(project.toolsEntry ? [project.toolsEntry] : []),
        ...(project.skillsEntry ? [project.skillsEntry] : []),
      ],
      options: { types: ["node"], lib: ["lib.es2022.d.ts"] },
    },
    ...(project.uiEntry
      ? [
          {
            files: [
              project.uiEntry,
              fileURLToPath(new URL("../client.d.ts", import.meta.url)),
            ],
            options: {
              types: ["react", "react-dom"],
              lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
            },
          },
        ]
      : []),
  ];
  const errors = groups.flatMap((group) =>
    ts.getPreEmitDiagnostics(
      ts.createProgram(group.files, { ...options, ...group.options }),
    ),
  );
  if (errors.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  await build({
    stdin: {
      contents: hostSource(project, manifest.name),
      resolveDir: root,
      loader: "js",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    write: false,
    logLevel: "silent",
  });
  if (project.uiEntry)
    await build({
      stdin: { contents: uiSource(project), resolveDir: root, loader: "js" },
      bundle: true,
      packages: "external",
      platform: "browser",
      format: "esm",
      write: false,
      outfile: join(root, "dist/isle-ui.js"),
      jsx: "automatic",
      plugins: [browserBoundary(root, project)],
      loader: {
        ".svg": "dataurl",
        ".png": "dataurl",
        ".jpg": "dataurl",
        ".jpeg": "dataurl",
        ".webp": "dataurl",
        ".woff": "dataurl",
        ".woff2": "dataurl",
      },
      logLevel: "silent",
    });
}
