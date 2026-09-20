import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { load as loadYaml } from "js-yaml";

const root = process.cwd();
const servicePath = resolve(
  root,
  process.argv.includes("--bundled")
    ? "../agent-runtime/dist/app-host/service.mjs"
    : "../../packages/app/host/dist/service.mjs",
);
const fixtureRoot = resolve(root, "../../packages/app/host/fixtures/dsh-portable-application");
const tempDir = mkdtempSync(join(tmpdir(), "isle-app-ui-service-"));
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
      rejectRequest(new Error(`Application UI Host ${method} 请求超时。\n${stderr}`));
    }, 10_000);
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });

try {
  const configuration = {
    settingsPath: join(tempDir, "settings.yaml"),
    applications: [
      {
        kind: "dsh",
        id: "@isle/fixture-dsh-portable-application",
        name: "Portable DSH fixture",
        version: "0.0.0",
        description: "Application UI service fixture",
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
  assert.equal(configured.applications.length, 1);
  assert.equal(configured.applications[0].error, null);
  assert.deepEqual(
    configured.applications[0].tools.map((tool) => tool.name),
    ["isle_dsh_echo"],
  );
  assert.deepEqual(configured.applications[0].ui, {
    kind: "sandbox",
    title: "Portable UI Fixture",
    layout: "full",
  });
  assert.equal(configured.applications[0].uiError, null);
  assert.deepEqual(configured.applications[0].compatibility, [{ adapter: "dsh" }]);
  assert.deepEqual(configured.applications[0].permissions, []);
  assert.equal(configured.applications[0].permissionStatus, "dsh-unsupported");
  assert.equal("packageRoot" in configured.applications[0], false, "UI 目录不得泄露本地应用路径。");

  const catalog = await request("catalog");
  assert.deepEqual(catalog, configured);

  const document = await request("uiDocument", {
    applicationId: "@isle/fixture-dsh-portable-application",
  });
  assert.match(document.script, /window\.isleApplication\.executeTool/);
  assert.match(document.style, /max-width:\s*32rem/);
  assert.equal("entry" in configured.applications[0].ui, false, "UI 目录不得泄露沙箱入口路径。");

  const executed = await request("execute", {
    applicationId: "@isle/fixture-dsh-portable-application",
    toolName: "isle_dsh_echo",
    arguments: { message: "hello", prefix: "ui" },
  });
  assert.equal(executed.value, "ui:hello");
  assert.deepEqual(executed.content, [{ type: "text", text: "ui:hello" }]);

  const owner = "@isle/fixture-dsh-portable-application";
  const settingsFile = join(configuration.settingsPath, "@isle", "fixture-dsh-portable-application", "settings.yaml");
  assert.equal(await request("toolPolicy.get", { applicationId: owner }), null);
  const beforePolicy = loadYaml(readFileSync(settingsFile, "utf8"));
  await request("toolPolicy.set", { applicationId: owner, policy: { allowedToolNames: [] } });
  assert.deepEqual(await request("toolPolicy.get", { applicationId: owner }), { allowedToolNames: [] });
  const deniedDoc = loadYaml(readFileSync(settingsFile, "utf8"));
  assert.deepEqual(deniedDoc["isle-fixture-portable"], beforePolicy["isle-fixture-portable"]);
  assert.deepEqual(deniedDoc.$isleHost.tools, { allowedToolNames: [] });
  await assert.rejects(
    request("execute", {
      applicationId: owner,
      toolName: "isle_dsh_echo",
      arguments: { message: "blocked", prefix: "must-not-save" },
    }),
    /用户已禁用工具/,
  );
  await request("configure", configuration);
  assert.deepEqual(
    await request("toolPolicy.get", { applicationId: owner }),
    { allowedToolNames: [] },
    "host restart retains revocation",
  );
  await assert.rejects(
    request("execute", { applicationId: owner, toolName: "isle_dsh_echo", arguments: { message: "still blocked" } }),
    /用户已禁用工具/,
  );
  await request("toolPolicy.set", { applicationId: owner, policy: { allowedToolNames: ["isle_dsh_echo", "read"] } });
  await Promise.all([
    request("execute", {
      applicationId: owner,
      toolName: "isle_dsh_echo",
      arguments: { message: "ok", prefix: "after-policy" },
    }),
    request("toolPolicy.set", { applicationId: owner, policy: { allowedToolNames: ["isle_dsh_echo"] } }),
  ]);
  const updatedDoc = loadYaml(readFileSync(settingsFile, "utf8"));
  assert.equal(updatedDoc["isle-fixture-portable"].prefix, "after-policy");
  assert.deepEqual(
    updatedDoc.$isleHost.tools.allowedToolNames,
    ["isle_dsh_echo"],
    "business writes preserve user grants",
  );
  await assert.rejects(
    request("toolPolicy.set", { applicationId: owner, policy: { allowedToolNames: "all" } }),
    /配置无效/,
  );
  await assert.rejects(request("toolPolicy.get", { applicationId: "another-application" }), /未启用或不存在/);
  const validSettings = readFileSync(settingsFile, "utf8");
  writeFileSync(settingsFile, "$isleHost:\n  tools:\n    allowedToolNames: all\n");
  await assert.rejects(
    request("execute", { applicationId: owner, toolName: "isle_dsh_echo", arguments: { message: "fail closed" } }),
    /配置无效/,
  );
  writeFileSync(settingsFile, validSettings);

  const badRiskRoot = join(tempDir, "bad-risk-application");
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
    ...configuration.applications[0],
    kind: "isle",
    id: "bad-risk",
    packageRoot: badRiskRoot,
    entry: pathToFileURL(join(badRiskRoot, "index.js")).href,
    patchPath: null,
  };
  for (const candidates of [
    [badRisk, configuration.applications[0]],
    [configuration.applications[0], badRisk],
  ]) {
    const isolated = await request("configure", {
      settingsPath: join(tempDir, "risk-isolation"),
      applications: candidates,
    });
    const invalid = isolated.applications.find((application) => application.id === badRisk.id);
    assert.match(invalid.error, /risk/);
    assert.deepEqual(invalid.tools, []);
    assert.equal(isolated.applications.find((application) => application.id === owner).error, null);
    assert.match(
      (
        await request("execute", {
          applicationId: owner,
          toolName: "isle_dsh_echo",
          arguments: { message: "after-bad-risk" },
        })
      ).value,
      /after-bad-risk/,
    );
    await assert.rejects(request("execute", { applicationId: badRisk.id, toolName: "bad_risk" }));
  }

  const legacyFixtureRoot = join(tempDir, "legacy-host-ui-application");
  cpSync(fixtureRoot, legacyFixtureRoot, { recursive: true });
  const legacyManifestPath = join(legacyFixtureRoot, "package.json");
  const legacyManifest = JSON.parse(readFileSync(legacyManifestPath, "utf8"));
  legacyManifest.isle.ui = { version: 1, kind: "host", renderer: "tool-workbench" };
  writeFileSync(legacyManifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`);

  const legacyConfigured = await request("configure", {
    settingsPath: join(tempDir, "legacy-settings.yaml"),
    applications: [
      {
        kind: "dsh",
        id: "@isle/fixture-dsh-portable-application",
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
  assert.equal(legacyConfigured.applications[0].error, null);
  assert.equal(legacyConfigured.applications[0].ui, null);
  assert.match(legacyConfigured.applications[0].uiError, /isle\.ui\.kind 不受支持：host/);

  const invalidFixtureRoot = join(tempDir, "invalid-ui-application");
  cpSync(fixtureRoot, invalidFixtureRoot, { recursive: true });
  const invalidManifestPath = join(invalidFixtureRoot, "package.json");
  const invalidManifest = JSON.parse(readFileSync(invalidManifestPath, "utf8"));
  invalidManifest.isle.ui.entry = "../outside.js";
  invalidManifest.dsh.client = { platform: "web" };
  writeFileSync(invalidManifestPath, `${JSON.stringify(invalidManifest, null, 2)}\n`);

  const invalidConfigured = await request("configure", {
    settingsPath: join(tempDir, "invalid-settings.yaml"),
    applications: [
      {
        kind: "dsh",
        id: "@isle/fixture-dsh-portable-application",
        name: "Invalid UI fixture",
        version: "0.0.0",
        description: "Invalid Application UI service fixture",
        source: "installed",
        entry: pathToFileURL(resolve(fixtureRoot, "index.js")).href,
        packageRoot: invalidFixtureRoot,
        patchPath: resolve(invalidFixtureRoot, "cordis.patch.yml"),
      },
    ],
  });
  assert.equal(invalidConfigured.applications[0].error, null, "无效 UI 不应阻止 DSH 服务端应用加载。");
  assert.equal(invalidConfigured.applications[0].ui, null);
  assert.match(invalidConfigured.applications[0].uiError, /必须是以 \.\/ 开头的包内相对路径/);
  assert.deepEqual(invalidConfigured.applications[0].compatibility, [{ adapter: "dsh", clientPlatform: "web" }]);
  await assert.rejects(
    request("uiDocument", { applicationId: "@isle/fixture-dsh-portable-application" }),
    /UI 声明无效/,
  );

  const largeRoot = join(tempDir, "large-ui-application");
  cpSync(fixtureRoot, largeRoot, { recursive: true });
  writeFileSync(join(largeRoot, "isle-ui.js"), `/*${"x".repeat(5 * 1024 * 1024)}*/`);
  writeFileSync(join(largeRoot, "index.js"), `
    export default { name: "large-response", inject: ["tools"], apply(ctx) {
      ctx.tools.register({ name: "large_response", description: "Response limit fixture", risk: "low",
        parameters: {}, output: { schema: {}, render: () => [] },
        execute: () => "x".repeat(5 * 1024 * 1024) });
    }};
  `);
  const large = await request("configure", {
    settingsPath: join(tempDir, "large-settings"),
    applications: [{ ...configuration.applications[0],
      entry: pathToFileURL(join(largeRoot, "index.js")).href,
      packageRoot: largeRoot, patchPath: join(largeRoot, "cordis.patch.yml"),
    }],
  });
  assert.equal(large.applications[0].error, null);
  assert.equal(large.applications[0].uiError, null);
  assert.ok((await request("uiDocument", { applicationId: owner })).script.length > 4 * 1024 * 1024);
  await assert.rejects(request("execute", { applicationId: owner, toolName: "large_response", arguments: {} }), /4 MiB/);
  assert.equal((await request("catalog")).applications.length, 1, "oversized tool responses do not kill the host");

  await request("shutdown");
  child.stdin.end();
  const exitCode = await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((_, rejectExit) => setTimeout(() => rejectExit(new Error("Application UI Host 关闭超时。")), 5_000)),
  ]);
  assert.equal(exitCode, 0, stderr);
  console.log("Application UI Host service E2E passed.");
} finally {
  output.close();
  if (child.exitCode === null) child.kill();
  rmSync(tempDir, { recursive: true, force: true });
}
