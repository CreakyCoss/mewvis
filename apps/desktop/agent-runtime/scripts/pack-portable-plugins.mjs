import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPluginSources, packPlugin } from "../../plugin-host/scripts/plugin-tooling.mjs";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(runtimeRoot, "..");
const outputRoot = join(runtimeRoot, "dist", "plugins");
const pluginsRoot = join(desktopRoot, "plugin-host", "plugins");
const portablePlugins = await discoverPluginSources(pluginsRoot);
if (portablePlugins.length === 0) throw new Error(`没有发现内置插件：${pluginsRoot}`);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const plugin of portablePlugins) {
  await packPlugin({
    source: plugin.sourceRoot,
    target: "dsh",
    outDir: join(outputRoot, plugin.name),
    quiet: true,
  });
}

console.log(`${portablePlugins.length} portable plugins packed to ${outputRoot}`);
