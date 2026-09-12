import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";
import { packApplication } from "@isle/app-dev/tooling";
import entries from "../../agent-runtime/build-entries.json" with { type: "json" };

const desktopRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const applicationSourceRoot = join(desktopRoot, "app-host", "apps", "story-scene-card");
const rssApplicationRoot = join(desktopRoot, "app-host", "apps", "rss-reader");
const tavernApplicationSourceRoot = join(desktopRoot, "app-host", "apps", "tavern");
const temporaryRoot = mkdtempSync(join(desktopRoot, ".agent-runtime-dsh-e2e-"));
const applicationRoot = join(temporaryRoot, "story-scene-card-dsh");
const tavernApplicationRoot = join(temporaryRoot, "tavern-dsh");
const requestedApplicationEntry = process.env.ISLE_DSH_RUNTIME_APPLICATION_ENTRY;
const requestedRssApplicationEntry = process.env.ISLE_DSH_RUNTIME_RSS_APPLICATION_ENTRY;
const requestedTavernApplicationEntry = process.env.ISLE_DSH_RUNTIME_TAVERN_APPLICATION_ENTRY;
const outputPath = join(temporaryRoot, "runner.mjs");
const environmentKey = "ISLE_DSH_RUNTIME_APPLICATION_URL";
const rssEnvironmentKey = "ISLE_DSH_RUNTIME_RSS_APPLICATION_URL";
const tavernEnvironmentKey = "ISLE_DSH_RUNTIME_TAVERN_APPLICATION_URL";
const applicationRootEnvironmentKey = "ISLE_DSH_RUNTIME_APPLICATION_ROOT";
const rssApplicationRootEnvironmentKey = "ISLE_DSH_RUNTIME_RSS_APPLICATION_ROOT";
const tavernApplicationRootEnvironmentKey = "ISLE_DSH_RUNTIME_TAVERN_APPLICATION_ROOT";

try {
  // The bundled resource loader resolves execution workers beside this test bundle.
  for (const name of [entries.executionHost.output, entries.piToolWorker.output, "vendor"])
    cpSync(join(desktopRoot, "agent-runtime/dist", name), join(temporaryRoot, name), { recursive: true });
  await packApplication({ source: applicationSourceRoot, target: "dsh", outDir: applicationRoot, quiet: true });
  await packApplication({ source: tavernApplicationSourceRoot, target: "dsh", outDir: tavernApplicationRoot, quiet: true });
  const manifest = JSON.parse(readFileSync(join(applicationRoot, "package.json"), "utf8"));
  const patch = readFileSync(join(applicationRoot, "cordis.patch.yml"), "utf8");
  const applicationEntry = requestedApplicationEntry
    ? resolve(desktopRoot, requestedApplicationEntry)
    : resolve(applicationRoot, manifest.main);
  const rssApplicationEntry = requestedRssApplicationEntry
    ? resolve(desktopRoot, requestedRssApplicationEntry)
    : resolve(rssApplicationRoot, "index.js");
  const tavernApplicationEntry = requestedTavernApplicationEntry
    ? resolve(desktopRoot, requestedTavernApplicationEntry)
    : resolve(tavernApplicationRoot, "index.js");

  assert.equal(manifest.main, "./index.js");
  assert.equal(manifest.dsh?.bundle?.patch, "./cordis.patch.yml");
  assert.match(patch, /name:\s*['"]?@isle\/story-scene-card/);

  await build({
    entryPoints: [join(desktopRoot, "agent-runtime", "tests", "dsh-application-runner.ts")],
    outfile: outputPath,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    sourcemap: "inline",
  });
  process.env[environmentKey] = pathToFileURL(applicationEntry).href;
  process.env[rssEnvironmentKey] = pathToFileURL(rssApplicationEntry).href;
  process.env[tavernEnvironmentKey] = pathToFileURL(tavernApplicationEntry).href;
  process.env[applicationRootEnvironmentKey] = applicationRoot;
  process.env[rssApplicationRootEnvironmentKey] = rssApplicationRoot;
  process.env[tavernApplicationRootEnvironmentKey] = tavernApplicationRoot;
  await import(`${pathToFileURL(outputPath).href}?cache=${Date.now()}`);
} finally {
  delete process.env[environmentKey];
  delete process.env[rssEnvironmentKey];
  delete process.env[tavernEnvironmentKey];
  delete process.env[applicationRootEnvironmentKey];
  delete process.env[rssApplicationRootEnvironmentKey];
  delete process.env[tavernApplicationRootEnvironmentKey];
  rmSync(temporaryRoot, { recursive: true, force: true });
}
