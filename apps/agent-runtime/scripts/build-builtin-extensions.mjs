import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExtensionPackage } from "@mewvis/extension-dev";
import { loadRegistrations } from "../../scripts/registrations.mjs";

const sources = fileURLToPath(new URL("../../extensions/", import.meta.url));
const output = fileURLToPath(new URL("../dist/extensions/", import.meta.url));
const extensions = await loadRegistrations(
  join(sources, "registry.json"),
  "extensions",
  sources,
);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const ids = new Set();
for (const extension of extensions) {
  const pkg = await buildExtensionPackage(extension.sourceRoot, {
    outputDir: join(output, extension.name),
  });
  if (ids.has(pkg.manifest.id))
    throw new Error(`重复内置插件：${pkg.manifest.id}`);
  ids.add(pkg.manifest.id);
}
console.log(`${ids.size} built-in extensions packed to ${output}`);
