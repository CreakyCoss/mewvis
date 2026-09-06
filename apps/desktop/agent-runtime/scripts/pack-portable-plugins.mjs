import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPluginSources, packPlugin, validatePlugin } from "@isle/plugin-dev/tooling";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(runtimeRoot, "..");
const outputRoot = join(runtimeRoot, "dist", "plugins");
const pluginsRoot = join(desktopRoot, "plugin-host", "plugins");
const builtinPlugins = await discoverPluginSources(pluginsRoot);
if (builtinPlugins.length === 0) throw new Error(`没有发现内置插件：${pluginsRoot}`);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const plugin of builtinPlugins) {
  const { manifest } = await validatePlugin(plugin.sourceRoot);
  // Chat depends on the Isle host bridge; keep existing portable plugins dual-target.
  const target = manifest.isle.permissions.includes("chat") ? "isle" : "dsh";
  await packPlugin({
    source: plugin.sourceRoot,
    target,
    outDir: join(outputRoot, plugin.name),
    quiet: true,
  });
}

console.log(`${builtinPlugins.length} built-in plugins packed to ${outputRoot}`);
