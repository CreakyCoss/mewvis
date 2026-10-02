import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.cwd();
const cli = fileURLToPath(import.meta.resolve("@mewvis/app-dev/cli"));
const fixtureRoot = mkdtempSync(join(tmpdir(), "mewvis-app-tooling-"));
const sourceRoot = join(fixtureRoot, "hello-application");
const mewvisOutput = join(fixtureRoot, "output-mewvis");
const dshOutput = join(fixtureRoot, "output-dsh");
const rssOutput = join(fixtureRoot, "rss-dsh");
const run = (...arguments_) =>
  execFileSync(process.execPath, [cli, ...arguments_], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });

try {
  assert.match(run("create", sourceRoot, "--name", "@example/hello", "--template", "tools"), /应用模板已创建/);
  assert.equal(existsSync(join(sourceRoot, "cordis.patch.yml")), false, "源码不应携带生成型 DSH patch。");
  const sourceManifest = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8"));
  assert.deepEqual(sourceManifest.mewvis.permissions, []);
  assert.match(run("validate", sourceRoot), /应用校验通过/);

  const legacySourceManifest = structuredClone(sourceManifest);
  delete legacySourceManifest.mewvis.permissions;
  writeFileSync(join(sourceRoot, "package.json"), `${JSON.stringify(legacySourceManifest, null, 2)}\n`);
  const missingPermissions = spawnSync(process.execPath, [cli, "validate", sourceRoot], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  assert.notEqual(missingPermissions.status, 0);
  assert.match(missingPermissions.stderr, /mewvis\.permissions 必须是权限用途数组/);
  writeFileSync(join(sourceRoot, "package.json"), `${JSON.stringify(sourceManifest, null, 2)}\n`);

  run("pack", sourceRoot, "--target", "mewvis", "--out-dir", mewvisOutput);
  const mewvisManifest = JSON.parse(readFileSync(join(mewvisOutput, "package.json"), "utf8"));
  assert.equal(mewvisManifest.mewvis.app.entry, "./index.js");
  assert.deepEqual(mewvisManifest.mewvis.permissions, []);
  assert.equal(mewvisManifest.dsh, undefined);
  assert.equal(mewvisManifest.dependencies, undefined, "运行依赖必须进入 bundle，而不是泄漏到产物清单。");
  assert.equal(existsSync(join(mewvisOutput, "cordis.patch.yml")), false);

  run("pack", sourceRoot, "--target", "dsh", "--out-dir", dshOutput);
  const dshManifest = JSON.parse(readFileSync(join(dshOutput, "package.json"), "utf8"));
  assert.equal(dshManifest.mewvis.app.entry, "./index.js", "DSH 产物仍应可由 Mewvis 原生加载。");
  assert.equal(dshManifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.match(readFileSync(join(dshOutput, "cordis.patch.yml"), "utf8"), /name: "@example\/hello"/);
  const generatedModule = await import(`${pathToFileURL(join(dshOutput, "index.js")).href}?test=${Date.now()}`);
  assert.equal(typeof generatedModule.default?.apply, "function");

  mkdirSync(join(fixtureRoot, "not-a-build"));
  const unsafe = spawnSync(
    process.execPath,
    [cli, "pack", sourceRoot, "--target", "mewvis", "--out-dir", join(fixtureRoot, "not-a-build")],
    { cwd: root, encoding: "utf8", env: process.env },
  );
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /不是 Mewvis 构建产物/);

  run("validate", resolve(root, "../applications/builtins/rss-reader"));
  run("pack", resolve(root, "../applications/builtins/rss-reader"), "--target", "dsh", "--out-dir", rssOutput);
  const rssSourceManifest = JSON.parse(
    readFileSync(resolve(root, "../applications/builtins/rss-reader/package.json"), "utf8"),
  );
  const rssOutputManifest = JSON.parse(readFileSync(join(rssOutput, "package.json"), "utf8"));
  assert.equal(rssSourceManifest.dsh, undefined, "RSS 源码必须只维护 Mewvis 清单。");
  assert.equal(rssOutputManifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(rssOutputManifest.dependencies, undefined);
  assert.deepEqual(rssOutputManifest.mewvis.permissions, ["network", "application-data", "open-external"]);
  assert.equal(existsSync(join(rssOutput, "THIRD_PARTY_NOTICES.md")), true);
  assert.match(readFileSync(join(rssOutput, "index.js"), "utf8"), /Mewvis RSS Reader\/0\.1/);

  execFileSync(process.execPath, [resolve(root, "scripts/app/host/rss-application-e2e.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MEWVIS_RSS_APPLICATION_ROOT: rssOutput, MEWVIS_RSS_APPLICATION_KIND: "dsh" },
  });
  console.log("Application tooling E2E passed.");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
