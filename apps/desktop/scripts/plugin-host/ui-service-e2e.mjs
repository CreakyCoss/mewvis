import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const root = process.cwd();
const servicePath = resolve(root, "agent-runtime/dist/plugin-host/service.mjs");
const fixtureRoot = resolve(root, "plugin-host/fixtures/dsh-portable-plugin");
const tempDir = mkdtempSync(join(tmpdir(), "isle-plugin-ui-service-"));
const child = spawn(process.execPath, [servicePath], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
});
const output = createInterface({ input: child.stdout });
let stderr = "";
let nextId = 1;
const pending = new Map();

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
output.on("line", (line) => {
  let response;
  try {
    response = JSON.parse(line);
  } catch {
    return;
  }
  const request = pending.get(response.id);
  if (!request) return;
  pending.delete(response.id);
  clearTimeout(request.timer);
  if (response.error) request.reject(new Error(response.error.message));
  else request.resolve(response.result);
});

const request = (method, params = null) =>
  new Promise((resolveRequest, rejectRequest) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectRequest(new Error(`Plugin UI Host ${method} 请求超时。\n${stderr}`));
    }, 10_000);
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });

try {
  const configured = await request("configure", {
    settingsPath: join(tempDir, "settings.yaml"),
    plugins: [
      {
        kind: "dsh",
        id: "@isle/fixture-dsh-portable-plugin",
        name: "Portable DSH fixture",
        version: "0.0.0",
        description: "Plugin UI service fixture",
        source: "installed",
        entry: pathToFileURL(resolve(fixtureRoot, "index.js")).href,
        packageRoot: fixtureRoot,
        patchPath: resolve(fixtureRoot, "cordis.patch.yml"),
        permissions: [],
        permissionStatus: "dsh-unsupported",
      },
    ],
  });
  assert.equal(configured.plugins.length, 1);
  assert.deepEqual(
    configured.plugins[0].tools.map((tool) => tool.name),
    ["isle_dsh_echo"],
  );
  assert.equal(configured.plugins[0].error, null);
  assert.deepEqual(configured.plugins[0].ui, {
    kind: "sandbox",
    title: "Portable UI Fixture",
    layout: "full",
  });
  assert.equal(configured.plugins[0].uiError, null);
  assert.deepEqual(configured.plugins[0].compatibility, [{ adapter: "dsh" }]);
  assert.deepEqual(configured.plugins[0].permissions, []);
  assert.equal(configured.plugins[0].permissionStatus, "dsh-unsupported");
  assert.equal("packageRoot" in configured.plugins[0], false, "UI 目录不得泄露本地插件路径。");

  const catalog = await request("catalog");
  assert.deepEqual(catalog, configured);

  const document = await request("uiDocument", {
    pluginId: "@isle/fixture-dsh-portable-plugin",
  });
  assert.match(document.script, /window\.islePlugin\.executeTool/);
  assert.match(document.style, /max-width:\s*32rem/);
  assert.equal("entry" in configured.plugins[0].ui, false, "UI 目录不得泄露沙箱入口路径。");

  const executed = await request("execute", {
    pluginId: "@isle/fixture-dsh-portable-plugin",
    toolName: "isle_dsh_echo",
    arguments: { message: "hello", prefix: "ui" },
  });
  assert.equal(executed.value, "ui:hello");
  assert.deepEqual(executed.content, [{ type: "text", text: "ui:hello" }]);

  const legacyFixtureRoot = join(tempDir, "legacy-host-ui-plugin");
  cpSync(fixtureRoot, legacyFixtureRoot, { recursive: true });
  const legacyManifestPath = join(legacyFixtureRoot, "package.json");
  const legacyManifest = JSON.parse(readFileSync(legacyManifestPath, "utf8"));
  legacyManifest.isle.ui = { version: 1, kind: "host", renderer: "tool-workbench" };
  writeFileSync(legacyManifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`);

  const legacyConfigured = await request("configure", {
    settingsPath: join(tempDir, "legacy-settings.yaml"),
    plugins: [
      {
        kind: "dsh",
        id: "@isle/fixture-dsh-portable-plugin",
        name: "Legacy host UI fixture",
        version: "0.0.0",
        description: "Legacy host renderer fixture",
        source: "installed",
        entry: pathToFileURL(resolve(fixtureRoot, "index.js")).href,
        packageRoot: legacyFixtureRoot,
        patchPath: resolve(legacyFixtureRoot, "cordis.patch.yml"),
      },
    ],
  });
  assert.equal(legacyConfigured.plugins[0].error, null);
  assert.equal(legacyConfigured.plugins[0].ui, null);
  assert.match(legacyConfigured.plugins[0].uiError, /isle\.ui\.kind 不受支持：host/);

  const invalidFixtureRoot = join(tempDir, "invalid-ui-plugin");
  cpSync(fixtureRoot, invalidFixtureRoot, { recursive: true });
  const invalidManifestPath = join(invalidFixtureRoot, "package.json");
  const invalidManifest = JSON.parse(readFileSync(invalidManifestPath, "utf8"));
  invalidManifest.isle.ui.entry = "../outside.js";
  invalidManifest.dsh.client = { platform: "web" };
  writeFileSync(invalidManifestPath, `${JSON.stringify(invalidManifest, null, 2)}\n`);

  const invalidConfigured = await request("configure", {
    settingsPath: join(tempDir, "invalid-settings.yaml"),
    plugins: [
      {
        kind: "dsh",
        id: "@isle/fixture-dsh-portable-plugin",
        name: "Invalid UI fixture",
        version: "0.0.0",
        description: "Invalid Plugin UI service fixture",
        source: "installed",
        entry: pathToFileURL(resolve(fixtureRoot, "index.js")).href,
        packageRoot: invalidFixtureRoot,
        patchPath: resolve(invalidFixtureRoot, "cordis.patch.yml"),
      },
    ],
  });
  assert.equal(invalidConfigured.plugins[0].error, null, "无效 UI 不应阻止 DSH 服务端插件加载。");
  assert.equal(invalidConfigured.plugins[0].ui, null);
  assert.match(invalidConfigured.plugins[0].uiError, /必须是以 \.\/ 开头的包内相对路径/);
  assert.deepEqual(invalidConfigured.plugins[0].compatibility, [{ adapter: "dsh", clientPlatform: "web" }]);
  await assert.rejects(request("uiDocument", { pluginId: "@isle/fixture-dsh-portable-plugin" }), /UI 声明无效/);

  await request("shutdown");
  child.stdin.end();
  const exitCode = await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((_, rejectExit) => setTimeout(() => rejectExit(new Error("Plugin UI Host 关闭超时。")), 5_000)),
  ]);
  assert.equal(exitCode, 0, stderr);
  console.log("Plugin UI Host service E2E passed.");
} finally {
  output.close();
  if (child.exitCode === null) child.kill();
  rmSync(tempDir, { recursive: true, force: true });
}
