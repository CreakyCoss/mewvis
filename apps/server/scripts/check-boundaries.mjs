import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

/** Keep system/storage helpers reusable and reject circular imports during every build. */
export function checkBoundaries(sourceRoot) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith(".ts")) files.push(path);
    }
  };
  walk(sourceRoot);
  const graph = new Map();
  const allowed = {
    shared: new Set(["shared"]),
    config: new Set(["config", "shared"]),
    infrastructure: new Set(["infrastructure", "shared"]),
    storage: new Set(["storage", "infrastructure", "shared"]),
    modules: new Set([
      "modules",
      "storage",
      "infrastructure",
      "shared",
      "config",
      "transport",
    ]),
    transport: new Set(["transport", "modules", "infrastructure", "shared"]),
  };
  const layer = (file) => relative(sourceRoot, file).split(/[\\/]/)[0];
  for (const file of files) {
    const targets = ts
      .preProcessFile(readFileSync(file, "utf8"), true)
      .importedFiles.map((imported) => imported.fileName)
      .filter((name) => name.startsWith("."))
      .map((name) => resolve(dirname(file), name.replace(/\.js$/, ".ts")));
    for (const target of targets) {
      if (!files.includes(target))
        throw new Error(
          `无法解析源码依赖：${relative(sourceRoot, file)} → ${relative(sourceRoot, target)}`,
        );
      if (allowed[layer(file)] && !allowed[layer(file)].has(layer(target)))
        throw new Error(
          `依赖方向错误：${relative(sourceRoot, file)} → ${relative(sourceRoot, target)}`,
        );
      if (
        layer(file) === "modules" &&
        layer(target) === "transport" &&
        !(
          file.endsWith("commands.ts") &&
          relative(sourceRoot, target)
            .replaceAll("\\", "/")
            .startsWith("transport/commands/")
        )
      )
        throw new Error(
          `业务服务不能依赖传输层：${relative(sourceRoot, file)}`,
        );
    }
    graph.set(file, targets);
  }
  const visited = new Set(),
    active = new Set();
  const visit = (file, chain) => {
    if (active.has(file))
      throw new Error(
        `循环依赖：${[...chain, file].map((p) => relative(sourceRoot, p)).join(" → ")}`,
      );
    if (visited.has(file)) return;
    active.add(file);
    for (const target of graph.get(file)) visit(target, [...chain, file]);
    active.delete(file);
    visited.add(file);
  };
  for (const file of files) visit(file, []);
  console.log(`Server 依赖边界检查通过：${files.length} 个源码文件。`);
}
