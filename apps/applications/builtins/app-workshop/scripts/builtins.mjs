import { build } from "esbuild";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const applicationRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let validator;
async function validation() {
  // Use the same source reader and compiler as installed projects. Never import
  // or execute a template's entry, package scripts, or configuration as code.
  validator ??= build({
    stdin: {
      contents: `export { readSource } from './main/host/source.ts';
export { compile } from './main/host/compiler.ts';`,
      resolveDir: applicationRoot,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  }).then(
    (result) =>
      import(
        `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
      ),
  );
  return validator;
}
async function directory(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error(`内置小应用目录无效：${path}`);
}
async function json(path) {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size > 64 * 1024
  )
    throw new Error(`内置小应用配置无效：${path}`);
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadBuiltins(root = join(applicationRoot, "mini-apps")) {
  await directory(root);
  const registry = await json(join(root, "registry.json"));
  if (
    !registry ||
    !Array.isArray(registry.applications) ||
    registry.applications.length > 64
  )
    throw new Error("内置小应用清单须为 applications 数组，最多 64 项。");
  const seen = new Set();
  const definitions = [];
  for (const id of registry.applications) {
    if (
      typeof id !== "string" ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(id) ||
      seen.has(id)
    )
      throw new Error(`内置小应用目录名无效或重复：${id}`);
    seen.add(id);
    const path = join(root, id);
    await directory(path);
    const manifest = await json(join(path, "manifest.json"));
    if (
      !manifest ||
      typeof manifest.name !== "string" ||
      !manifest.name.trim() ||
      manifest.name.trim().length > 80 ||
      typeof manifest.description !== "string" ||
      manifest.description.length > 500 ||
      !Number.isSafeInteger(manifest.version) ||
      manifest.version < 1
    )
      throw new Error(
        `内置小应用 ${id} 的 name、description 或 version 无效。`,
      );
    const { readSource, compile } = await validation();
    const files = await readSource(join(path, ".workshop"));
    const result = compile(files);
    if (result.diagnostics.length)
      throw new Error(
        `内置小应用 ${id} 构建失败：\n${result.diagnostics.map((d) => `${d.file}:${d.line}:${d.column} ${d.message}`).join("\n")}`,
      );
    definitions.push({
      id,
      name: manifest.name.trim(),
      description: manifest.description.trim(),
      version: manifest.version,
      files,
    });
  }
  return definitions;
}

export async function prepareBuiltins(root = applicationRoot) {
  const definitions = await loadBuiltins(join(root, "mini-apps"));
  await writeFile(
    join(root, "main/host/generated/builtins.ts"),
    `// Generated from mini-apps/registry.json.\nimport type { BuiltinDefinition } from '../../contracts.js';\nexport default ${JSON.stringify(definitions)} satisfies BuiltinDefinition[];\n`,
  );
}
