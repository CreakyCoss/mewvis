import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = process.cwd();
const fixtureRoot = resolve(root, "plugin-host/fixtures/dsh-portable-plugin");
const manifest = JSON.parse(readFileSync(resolve(fixtureRoot, "package.json"), "utf8"));
const patch = readFileSync(resolve(fixtureRoot, "cordis.patch.yml"), "utf8");

assert.equal(manifest.dsh?.bundle?.patch, "./cordis.patch.yml", "兼容夹具必须使用标准 dsh.bundle 清单。");
assert.match(patch, /name:\s*['"]?@isle\/fixture-dsh-portable-plugin/, "Bundle patch 必须引用插件包入口。");

const tempDir = mkdtempSync(join(root, ".isle-plugin-host-dsh-compat-"));
const bundlePath = join(tempDir, "runner.mjs");
const settingsRoot = join(tempDir, "plugins");

try {
  mkdirSync(settingsRoot, { recursive: true });
  writeFileSync(join(settingsRoot, "settings.yaml"), 'isle-fixture-portable:\n  prefix: "migrated"\n', { mode: 0o600 });
  process.env.ISLE_DSH_COMPAT_FIXTURE_URL = pathToFileURL(resolve(fixtureRoot, "index.js")).href;
  process.env.ISLE_DSH_COMPAT_FIXTURE_ROOT = fixtureRoot;
  process.env.ISLE_DSH_COMPAT_SETTINGS_PATH = join(tempDir, "plugin-settings.yaml");
  process.env.ISLE_DSH_COMPAT_SETTINGS_ROOT = settingsRoot;
  await build({
    entryPoints: [resolve(root, "plugin-host/tests/dsh-compat-runner.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    outfile: bundlePath,
  });
  await import(pathToFileURL(bundlePath).href);
} finally {
  delete process.env.ISLE_DSH_COMPAT_FIXTURE_URL;
  delete process.env.ISLE_DSH_COMPAT_FIXTURE_ROOT;
  delete process.env.ISLE_DSH_COMPAT_SETTINGS_PATH;
  delete process.env.ISLE_DSH_COMPAT_SETTINGS_ROOT;
  rmSync(tempDir, { recursive: true, force: true });
}
