import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { packPlugin } from "../../plugin-host/scripts/plugin-tooling.mjs";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(runtimeRoot, "..");
const outputRoot = join(runtimeRoot, "dist", "plugins");
const portablePlugins = [
  {
    name: "story-scene-card",
    sourceRoot: join(desktopRoot, "plugin-host", "plugins", "story-scene-card"),
  },
  {
    name: "rss-reader",
    sourceRoot: join(desktopRoot, "plugin-host", "plugins", "rss-reader"),
  },
  {
    name: "tavern",
    sourceRoot: join(desktopRoot, "plugin-host", "plugins", "tavern"),
  },
];

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

console.log(`Portable plugins packed to ${outputRoot}`);
