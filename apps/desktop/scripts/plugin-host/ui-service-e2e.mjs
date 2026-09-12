import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { load as loadYaml } from "js-yaml";

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
  const configuration = {
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
  };
  const configured = await request("configure", configuration);
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

  const owner = "@isle/fixture-dsh-portable-plugin";
  const settingsFile = join(configuration.settingsPath, "@isle", "fixture-dsh-portable-plugin", "settings.yaml");
  assert.equal(await request("toolPolicy.get", { pluginId: owner }), null);
  const beforePolicy = loadYaml(readFileSync(settingsFile, "utf8"));
  await request("toolPolicy.set", { pluginId: owner, policy: { allowedToolNames: [] } });
  assert.deepEqual(await request("toolPolicy.get", { pluginId: owner }), { allowedToolNames: [] });
  const deniedDoc = loadYaml(readFileSync(settingsFile, "utf8"));
  assert.deepEqual(deniedDoc["isle-fixture-portable"], beforePolicy["isle-fixture-portable"]);
  assert.deepEqual(deniedDoc.$isleHost.tools, { allowedToolNames: [] });
  await assert.rejects(
    request("execute", {
      pluginId: owner,
      toolName: "isle_dsh_echo",
      arguments: { message: "blocked", prefix: "must-not-save" },
    }),
    /用户已禁用工具/,
  );
  await request("configure", configuration);
  assert.deepEqual(
    await request("toolPolicy.get", { pluginId: owner }),
    { allowedToolNames: [] },
    "host restart retains revocation",
  );
  await assert.rejects(
    request("execute", { pluginId: owner, toolName: "isle_dsh_echo", arguments: { message: "still blocked" } }),
    /用户已禁用工具/,
  );
  await request("toolPolicy.set", { pluginId: owner, policy: { allowedToolNames: ["isle_dsh_echo", "read"] } });
  await Promise.all([
    request("execute", {
      pluginId: owner,
      toolName: "isle_dsh_echo",
      arguments: { message: "ok", prefix: "after-policy" },
    }),
    request("toolPolicy.set", { pluginId: owner, policy: { allowedToolNames: ["isle_dsh_echo"] } }),
  ]);
  const updatedDoc = loadYaml(readFileSync(settingsFile, "utf8"));
  assert.equal(updatedDoc["isle-fixture-portable"].prefix, "after-policy");
  assert.deepEqual(
    updatedDoc.$isleHost.tools.allowedToolNames,
    ["isle_dsh_echo"],
    "business writes preserve user grants",
  );
  await assert.rejects(request("toolPolicy.set", { pluginId: owner, policy: { allowedToolNames: "all" } }), /配置无效/);
  await assert.rejects(request("toolPolicy.get", { pluginId: "another-plugin" }), /未启用或不存在/);
  const validSettings = readFileSync(settingsFile, "utf8");
  writeFileSync(settingsFile, "$isleHost:\n  tools:\n    allowedToolNames: all\n");
  await assert.rejects(
    request("execute", { pluginId: owner, toolName: "isle_dsh_echo", arguments: { message: "fail closed" } }),
    /配置无效/,
  );
  writeFileSync(settingsFile, validSettings);

  const badRiskRoot = join(tempDir, "bad-risk-plugin");
  cpSync(fixtureRoot, badRiskRoot, { recursive: true });
  writeFileSync(
    join(badRiskRoot, "index.js"),
    `
    export default { name: "bad-risk", inject: ["tools"], apply(ctx) {
      ctx.tools.register({ name: "bad_risk", description: "Invalid risk fixture", risk: "critical",
        parameters: { type: "object", properties: {} },
        output: { schema: {}, render: () => [] }, execute: () => null });
    }};
  `,
  );
  const badRisk = {
    ...configuration.plugins[0],
    kind: "isle",
    id: "bad-risk",
    packageRoot: badRiskRoot,
    entry: pathToFileURL(join(badRiskRoot, "index.js")).href,
    patchPath: null,
  };
  for (const candidates of [
    [badRisk, configuration.plugins[0]],
    [configuration.plugins[0], badRisk],
  ]) {
    const isolated = await request("configure", {
      settingsPath: join(tempDir, "risk-isolation"),
      plugins: candidates,
    });
    const invalid = isolated.plugins.find((plugin) => plugin.id === badRisk.id);
    assert.match(invalid.error, /risk/);
    assert.deepEqual(invalid.tools, []);
    assert.equal(isolated.plugins.find((plugin) => plugin.id === owner).error, null);
    assert.match(
      (
        await request("execute", {
          pluginId: owner,
          toolName: "isle_dsh_echo",
          arguments: { message: "after-bad-risk" },
        })
      ).value,
      /after-bad-risk/,
    );
    await assert.rejects(request("execute", { pluginId: badRisk.id, toolName: "bad_risk" }));
  }

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
