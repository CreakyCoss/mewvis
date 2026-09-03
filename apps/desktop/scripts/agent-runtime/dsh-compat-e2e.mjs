import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const desktopRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const pluginRoot = join(desktopRoot, "plugin-host", "plugins", "story-scene-card");
const rssPluginRoot = join(desktopRoot, "plugin-host", "plugins", "rss-reader");
const tavernPluginRoot = join(desktopRoot, "plugin-host", "plugins", "tavern");
const manifest = JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf8"));
const patch = readFileSync(join(pluginRoot, "cordis.patch.yml"), "utf8");
const requestedPluginEntry = process.env.ISLE_DSH_RUNTIME_PLUGIN_ENTRY;
const requestedRssPluginEntry = process.env.ISLE_DSH_RUNTIME_RSS_PLUGIN_ENTRY;
const requestedTavernPluginEntry = process.env.ISLE_DSH_RUNTIME_TAVERN_PLUGIN_ENTRY;
const requestedStoryDeslopEntry = process.env.ISLE_DSH_RUNTIME_STORY_DESLOP_ENTRY;
const pluginEntry = requestedPluginEntry
  ? resolve(desktopRoot, requestedPluginEntry)
  : resolve(pluginRoot, manifest.main);
const rssPluginEntry = requestedRssPluginEntry
  ? resolve(desktopRoot, requestedRssPluginEntry)
  : resolve(rssPluginRoot, "index.js");
const tavernPluginEntry = requestedTavernPluginEntry
  ? resolve(desktopRoot, requestedTavernPluginEntry)
  : resolve(tavernPluginRoot, "index.js");
const storyDeslopEntry = requestedStoryDeslopEntry
  ? resolve(desktopRoot, requestedStoryDeslopEntry)
  : resolve(desktopRoot, "resources/skills/story-deslop/index.js");

assert.equal(manifest.main, "./index.js");
assert.equal(manifest.dsh?.bundle?.patch, "./cordis.patch.yml");
assert.match(patch, /name:\s*['"]?@isle\/story-scene-card/);

const temporaryRoot = mkdtempSync(join(desktopRoot, ".agent-runtime-dsh-e2e-"));
const outputPath = join(temporaryRoot, "runner.mjs");
const environmentKey = "ISLE_DSH_RUNTIME_PLUGIN_URL";
const rssEnvironmentKey = "ISLE_DSH_RUNTIME_RSS_PLUGIN_URL";
const tavernEnvironmentKey = "ISLE_DSH_RUNTIME_TAVERN_PLUGIN_URL";
const storyDeslopEnvironmentKey = "ISLE_DSH_RUNTIME_STORY_DESLOP_URL";
const pluginRootEnvironmentKey = "ISLE_DSH_RUNTIME_PLUGIN_ROOT";
const rssPluginRootEnvironmentKey = "ISLE_DSH_RUNTIME_RSS_PLUGIN_ROOT";
const tavernPluginRootEnvironmentKey = "ISLE_DSH_RUNTIME_TAVERN_PLUGIN_ROOT";
const storyDeslopRootEnvironmentKey = "ISLE_DSH_RUNTIME_STORY_DESLOP_ROOT";

try {
  await build({
    entryPoints: [join(desktopRoot, "agent-runtime", "tests", "dsh-plugin-runner.ts")],
    outfile: outputPath,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    sourcemap: "inline",
  });
  process.env[environmentKey] = pathToFileURL(pluginEntry).href;
  process.env[rssEnvironmentKey] = pathToFileURL(rssPluginEntry).href;
  process.env[tavernEnvironmentKey] = pathToFileURL(tavernPluginEntry).href;
  process.env[storyDeslopEnvironmentKey] = pathToFileURL(storyDeslopEntry).href;
  process.env[pluginRootEnvironmentKey] = pluginRoot;
  process.env[rssPluginRootEnvironmentKey] = rssPluginRoot;
  process.env[tavernPluginRootEnvironmentKey] = tavernPluginRoot;
  process.env[storyDeslopRootEnvironmentKey] = resolve(desktopRoot, "resources/skills/story-deslop");
  await import(`${pathToFileURL(outputPath).href}?cache=${Date.now()}`);
} finally {
  delete process.env[environmentKey];
  delete process.env[rssEnvironmentKey];
  delete process.env[tavernEnvironmentKey];
  delete process.env[storyDeslopEnvironmentKey];
  delete process.env[pluginRootEnvironmentKey];
  delete process.env[rssPluginRootEnvironmentKey];
  delete process.env[tavernPluginRootEnvironmentKey];
  delete process.env[storyDeslopRootEnvironmentKey];
  rmSync(temporaryRoot, { recursive: true, force: true });
}
