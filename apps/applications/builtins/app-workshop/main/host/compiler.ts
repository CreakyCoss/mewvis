import ts from "./generated/compiler.js";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import runtime from "./generated/runtime.js";
import theme from "./generated/theme.js";
import {
  DEPENDENCIES,
  MAIN_ENTRY,
  validateFileName,
  type Diagnostic,
  type FileMap,
} from "../contracts.js";

export const sourceHash = (files: FileMap) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
    )
    .digest("hex");

// The compiler reads only this in-memory module table. It never loads project code,
// project executables, package scripts, plugins, Node modules or filesystem imports.
export function compile(files: FileMap): {
  script: string;
  style: string;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const factories: string[] = [];
  const links: Record<string, Record<string, string>> = {};
  const resolveImport = (from: string, specifier: string) => {
    if ((DEPENDENCIES as readonly string[]).includes(specifier))
      return specifier;
    if (!specifier.startsWith("./") && !specifier.startsWith("../"))
      throw new Error(
        `不支持的依赖：${specifier}。仅支持 React 与小应用视图 SDK。`,
      );
    const base = posix.normalize(posix.join(posix.dirname(from), specifier));
    if (base.startsWith("../") || posix.isAbsolute(base))
      throw new Error("导入不能越过项目目录。");
    const file = [
      base,
      ...[
        ".tsx",
        ".ts",
        ".jsx",
        ".js",
        ".json",
        "/index.tsx",
        "/index.ts",
        "/index.js",
      ].map((ext) => base + ext),
    ].find((name) => Object.hasOwn(files, name));
    if (!file) throw new Error(`找不到导入文件：${specifier}`);
    if (!/\.(?:[jt]sx?|css|json)$/.test(file))
      throw new Error(`不能导入此类文件：${specifier}`);
    return file;
  };
  for (const name of [MAIN_ENTRY, "package.json", "tsconfig.json"])
    if (!Object.hasOwn(files, name))
      diagnostics.push({
        file: name,
        line: 1,
        column: 1,
        message: `缺少项目文件 ${name}。`,
      });
  for (const [name, source] of Object.entries(files)) {
    validateFileName(name);
    links[name] = {};
    if (name.endsWith(".json")) {
      try {
        const parsed =
          name === "tsconfig.json"
            ? ts.parseConfigFileTextToJson(name, source)
            : { config: JSON.parse(source), error: undefined };
        if (parsed.error)
          throw new Error(
            ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"),
          );
        if (
          ["package.json", "tsconfig.json"].includes(name) &&
          (!parsed.config ||
            typeof parsed.config !== "object" ||
            Array.isArray(parsed.config))
        )
          throw new Error("项目配置须为 JSON 对象。");
        if (
          name === "tsconfig.json" &&
          (parsed.config.extends || parsed.config.compilerOptions?.plugins)
        )
          throw new Error("工坊编译不支持外部 tsconfig 或编译插件。");
        factories.push(
          `${JSON.stringify(name)}: function(module) { module.exports = ${JSON.stringify(parsed.config)}; }`,
        );
      } catch (error) {
        diagnostics.push({
          file: name,
          line: 1,
          column: 1,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }
    if (!/\.(?:[jt]sx?|css)$/.test(name)) continue;
    if (name.endsWith(".css")) {
      if (/@import\s|url\s*\(/i.test(source))
        diagnostics.push({
          file: name,
          line: 1,
          column: 1,
          message:
            "样式暂不支持 @import 或 url()，请使用项目内样式与内联资源。",
        });
      factories.push(
        `${JSON.stringify(name)}: function(module) { module.exports = {}; }`,
      );
      continue;
    }
    const ast = ts.createSourceFile(
      name,
      source,
      ts.ScriptTarget.ES2022,
      true,
      /x$/.test(name) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const report = (node: ts.Node, message: string) => {
      const location = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      diagnostics.push({
        file: name,
        line: location.line + 1,
        column: location.character + 1,
        message,
      });
    };
    const dependency = (node: ts.Node, value: ts.Node | undefined) => {
      if (!value || !ts.isStringLiteral(value)) {
        report(node, "导入必须使用固定字符串路径。");
        return;
      }
      try {
        links[name][value.text] = resolveImport(name, value.text);
      } catch (error) {
        report(node, error instanceof Error ? error.message : String(error));
      }
    };
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly)
        dependency(node, node.moduleSpecifier);
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        !node.isTypeOnly
      )
        dependency(node, node.moduleSpecifier);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      )
        dependency(node, node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    links[name]["react/jsx-runtime"] = "react/jsx-runtime";
    const result = ts.transpileModule(source, {
      fileName: name,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        isolatedModules: true,
      },
    });
    for (const d of result.diagnostics ?? []) {
      if (d.category !== ts.DiagnosticCategory.Error) continue;
      const position = d.file?.getLineAndCharacterOfPosition(d.start ?? 0);
      diagnostics.push({
        file: name,
        line: (position?.line ?? 0) + 1,
        column: (position?.character ?? 0) + 1,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      });
    }
    factories.push(
      `${JSON.stringify(name)}: function(module, exports, require) {\n${result.outputText}\n}`,
    );
  }
  const script = `(()=>{\n${runtime}\nconst native=__workshopRuntime.modules;
const factories={${factories.join(",\n")}};
const links=${JSON.stringify(links)};
const cache=Object.create(null);
function load(id){
  if(Object.hasOwn(native,id)) return native[id];
  if(Object.hasOwn(cache,id)) return cache[id].exports;
  if(!Object.hasOwn(factories,id)) throw new Error('不支持的模块：'+id);
  const module={exports:{}}; cache[id]=module;
  const require=(name)=>{const target=links[id][name];if(!target)throw new Error('不支持的导入：'+name);return load(target)};
  factories[id](module,module.exports,require); return module.exports;
}
const root=document.createElement('div');root.id='root';root.style.minHeight='100vh';document.body.append(root);
load(${JSON.stringify(MAIN_ENTRY)});\n})();`;
  const style =
    theme +
    "\n" +
    Object.entries(files)
      .filter(([name]) => name.endsWith(".css"))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, source]) => source)
      .join("\n");
  if (Buffer.byteLength(script) + Buffer.byteLength(style) > 3 * 1024 * 1024)
    diagnostics.push({
      file: MAIN_ENTRY,
      line: 1,
      column: 1,
      message: "构建产物超过 3 MiB。",
    });
  return { script, style, diagnostics };
}
