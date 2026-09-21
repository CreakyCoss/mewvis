import { readdir, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExtensionPackage } from "@isle/extension-dev";

const sources = fileURLToPath(new URL("../../extensions/", import.meta.url));
const output = fileURLToPath(new URL("../dist/extensions/", import.meta.url));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const ids = new Set();
for (const directory of (await readdir(sources, { withFileTypes: true })).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (!directory.isDirectory() || directory.name.startsWith(".")) continue;
  const source = join(sources, directory.name);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  if (!manifest["isle.extension"]) continue;
  const pkg = await buildExtensionPackage(source, { outputDir: join(output, directory.name) });
  if (ids.has(pkg.manifest.id)) throw new Error(`重复内置插件：${pkg.manifest.id}`);
  ids.add(pkg.manifest.id);
}
console.log(`${ids.size} built-in extensions packed to ${output}`);
