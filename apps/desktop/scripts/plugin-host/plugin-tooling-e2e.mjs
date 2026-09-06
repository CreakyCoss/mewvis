import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { discoverPluginSources } from "@isle/plugin-dev/tooling";

const root = process.cwd();
const cli = fileURLToPath(import.meta.resolve("@isle/plugin-dev/cli"));
const fixtureRoot = mkdtempSync(join(tmpdir(), "isle-plugin-tooling-"));
const sourceRoot = join(fixtureRoot, "hello-plugin");
const secondSourceRoot = join(fixtureRoot, "alpha-plugin");
const isleOutput = join(fixtureRoot, "output-isle");
const dshOutput = join(fixtureRoot, "output-dsh");
const rssOutput = join(fixtureRoot, "rss-dsh");
const run = (...arguments_) =>
  execFileSync(process.execPath, [cli, ...arguments_], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });

try {
  assert.match(run("create", sourceRoot, "--name", "@example/hello", "--template", "tools"), /插件模板已创建/);
  run("create", secondSourceRoot, "--name", "@example/alpha", "--template", "tools");
  assert.equal(existsSync(join(sourceRoot, "cordis.patch.yml")), false, "源码不应携带生成型 DSH patch。");
  const sourceManifest = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8"));
  assert.deepEqual(sourceManifest.isle.permissions, []);
  const discovered = await discoverPluginSources(fixtureRoot);
  assert.deepEqual(
    discovered.map((plugin) => plugin.name),
    ["alpha-plugin", "hello-plugin"],
  );
  assert.match(run("validate", sourceRoot), /插件校验通过/);

  const legacySourceManifest = structuredClone(sourceManifest);
  delete legacySourceManifest.isle.permissions;
  writeFileSync(join(sourceRoot, "package.json"), `${JSON.stringify(legacySourceManifest, null, 2)}\n`);
  const missingPermissions = spawnSync(process.execPath, [cli, "validate", sourceRoot], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  assert.notEqual(missingPermissions.status, 0);
  assert.match(missingPermissions.stderr, /isle\.permissions 必须是权限用途数组/);
  writeFileSync(join(sourceRoot, "package.json"), `${JSON.stringify(sourceManifest, null, 2)}\n`);

  run("pack", sourceRoot, "--target", "isle", "--out-dir", isleOutput);
  const isleManifest = JSON.parse(readFileSync(join(isleOutput, "package.json"), "utf8"));
  assert.equal(isleManifest.isle.plugin.entry, "./index.js");
  assert.deepEqual(isleManifest.isle.permissions, []);
  assert.equal(isleManifest.dsh, undefined);
  assert.equal(isleManifest.dependencies, undefined, "运行依赖必须进入 bundle，而不是泄漏到产物清单。");
  assert.equal(existsSync(join(isleOutput, "cordis.patch.yml")), false);

  run("pack", sourceRoot, "--target", "dsh", "--out-dir", dshOutput);
  const dshManifest = JSON.parse(readFileSync(join(dshOutput, "package.json"), "utf8"));
  assert.equal(dshManifest.isle.plugin.entry, "./index.js", "DSH 产物仍应可由 Isle 原生加载。");
  assert.equal(dshManifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.match(readFileSync(join(dshOutput, "cordis.patch.yml"), "utf8"), /name: "@example\/hello"/);
  const generatedModule = await import(`${pathToFileURL(join(dshOutput, "index.js")).href}?test=${Date.now()}`);
  assert.equal(typeof generatedModule.default?.apply, "function");

  mkdirSync(join(fixtureRoot, "not-a-build"));
  const unsafe = spawnSync(
    process.execPath,
    [cli, "pack", sourceRoot, "--target", "isle", "--out-dir", join(fixtureRoot, "not-a-build")],
    { cwd: root, encoding: "utf8", env: process.env },
  );
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /不是 Isle 构建产物/);

  run("validate", resolve(root, "plugin-host/plugins/rss-reader"));
  run("pack", resolve(root, "plugin-host/plugins/rss-reader"), "--target", "dsh", "--out-dir", rssOutput);
  const rssSourceManifest = JSON.parse(
    readFileSync(resolve(root, "plugin-host/plugins/rss-reader/package.json"), "utf8"),
  );
  const rssOutputManifest = JSON.parse(readFileSync(join(rssOutput, "package.json"), "utf8"));
  assert.equal(rssSourceManifest.dsh, undefined, "RSS 源码必须只维护 Isle 清单。");
  assert.equal(rssOutputManifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(rssOutputManifest.dependencies, undefined);
  assert.deepEqual(rssOutputManifest.isle.permissions, ["network", "plugin-data", "open-external"]);
  assert.equal(existsSync(join(rssOutput, "THIRD_PARTY_NOTICES.md")), true);
  assert.match(readFileSync(join(rssOutput, "index.js"), "utf8"), /Mewvis RSS Reader\/0\.1/);

  execFileSync(process.execPath, [resolve(root, "scripts/plugin-host/rss-plugin-e2e.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ISLE_RSS_PLUGIN_ROOT: rssOutput, ISLE_RSS_PLUGIN_KIND: "dsh" },
  });
  console.log("Plugin tooling E2E passed.");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
