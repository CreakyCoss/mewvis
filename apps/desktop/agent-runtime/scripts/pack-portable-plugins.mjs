import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { dshBundleCompatibilityPlugin } from "./esbuild-dsh.mjs";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(runtimeRoot, "..");
const outputRoot = join(runtimeRoot, "dist", "plugins");
const portablePlugins = [
  {
    name: "story-scene-card",
    sourceRoot: join(desktopRoot, "plugin-host", "plugins", "story-scene-card"),
    assets: ["package.json", "cordis.patch.yml", "README.md", "isle-ui.js", "isle-ui.css"],
  },
  {
    name: "rss-reader",
    sourceRoot: join(desktopRoot, "plugin-host", "plugins", "rss-reader"),
    assets: ["package.json", "cordis.patch.yml", "README.md", "isle-ui.js", "isle-ui.css"],
  },
  {
    name: "tavern",
    sourceRoot: join(desktopRoot, "plugin-host", "plugins", "tavern"),
    assets: ["package.json", "cordis.patch.yml", "README.md", "isle-ui.js", "isle-ui.css"],
  },
  {
    name: "story-deslop",
    sourceRoot: join(desktopRoot, "resources", "skills", "story-deslop"),
    assets: ["package.json", "cordis.patch.yml", "README.md", "SKILL.md", "references"],
  },
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const plugin of portablePlugins) {
  const { name: pluginName, sourceRoot, assets } = plugin;
  const targetRoot = join(outputRoot, pluginName);
  const manifest = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8"));
  const sourceEntry = join(sourceRoot, manifest.main);

  await mkdir(targetRoot, { recursive: true });
  await build({
    entryPoints: [sourceEntry],
    outfile: join(targetRoot, "index.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    minify: false,
    sourcemap: false,
    banner: {
      // Some CommonJS dependencies (for example yaml) dynamically load Node
      // built-ins. ESM has no global require, so provide a bundle-local one.
      js: 'import { createRequire as __isleCreateRequire } from "node:module"; const require = __isleCreateRequire(import.meta.url);',
    },
    plugins: [dshBundleCompatibilityPlugin],
  });
  await Promise.all(assets.map((name) => cp(join(sourceRoot, name), join(targetRoot, name), { recursive: true })));
  await writeFile(
    join(targetRoot, "package.json"),
    `${JSON.stringify({ ...manifest, bundled: true }, null, 2)}\n`,
    "utf8",
  );
}

console.log(`Portable plugins packed to ${outputRoot}`);
