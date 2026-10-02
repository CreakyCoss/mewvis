import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DshCompatApplicationHost } from "../src/index.js";

const fixtureUrl = process.env.MEWVIS_DSH_COMPAT_FIXTURE_URL;
assert.ok(fixtureUrl, "测试必须提供外部 DSH 应用入口 URL。");
const fixtureRoot = process.env.MEWVIS_DSH_COMPAT_FIXTURE_ROOT;
assert.ok(fixtureRoot, "测试必须提供外部 DSH 应用根目录。");
const settingsPath = process.env.MEWVIS_DSH_COMPAT_SETTINGS_PATH;
assert.ok(settingsPath, "测试必须提供持久化 settings 文件路径。");
const settingsRoot = process.env.MEWVIS_DSH_COMPAT_SETTINGS_ROOT;
assert.ok(settingsRoot, "测试必须提供 namespace 隔离 settings 目录。");
const host = await DshCompatApplicationHost.create();

try {
  assert.deepEqual(host.applicationIds, []);
  await assert.rejects(
    () =>
      host.load("missing-service", {
        inject: ["sessions"],
        apply() {},
      }),
    /尚未提供的服务：sessions/,
  );
  await host.loadBundle("fixture", {
    packageRoot: fixtureRoot,
    packageName: "@mewvis/fixture-dsh-portable-application",
    patchPath: `${fixtureRoot}/cordis.patch.yml`,
    entrySpecifier: fixtureUrl,
  });
  assert.deepEqual(host.applicationIds, ["fixture:mewvis-fixture-portable"]);

  assert.deepEqual(
    host.toolSchemas().map((tool) => tool.name),
    ["mewvis_dsh_echo"],
  );

  const skills = await host.listSkills();
  assert.deepEqual(
    skills.map((skill) => skill.name),
    ["mewvis-dsh-echo"],
  );
  assert.equal(skills[0]?.provider, "runtime");
  assert.equal(skills[0]?.invocation.modelInvocable, true);
  assert.equal(skills[0]?.invocation.userInvocable, true);
  assert.equal(
    (await host.getSkill("mewvis-dsh-echo"))?.content,
    "Call the mewvis_dsh_echo tool and preserve the user's message.",
  );

  const result = await host.executeTool({
    callId: "compat-call-1",
    name: "mewvis_dsh_echo",
    arguments: { message: "hello" },
  });
  assert.equal(result.isError, false);
  if (!result.isError) {
    assert.equal(result.value, "echo:hello");
    assert.deepEqual(result.content, [{ type: "text", text: "echo:hello" }]);
  }

  const invalid = await host.executeTool({
    callId: "compat-call-2",
    name: "mewvis_dsh_echo",
    arguments: {},
  });
  assert.equal(invalid.isError, true, "DSH defineTool 必须保留参数校验语义。");

  await assert.rejects(
    () =>
      host.loadBundle("fixture", {
        packageRoot: fixtureRoot,
        packageName: "@mewvis/fixture-dsh-portable-application",
        patchPath: `${fixtureRoot}/cordis.patch.yml`,
        entrySpecifier: fixtureUrl,
      }),
    /已经加载/,
  );
  assert.equal(await host.unload("fixture"), true);
  assert.equal(await host.unload("fixture"), false);
  assert.deepEqual(host.toolSchemas(), [], "Fiber dispose 后工具必须自动注销。");
  assert.deepEqual(await host.listSkills(), [], "Fiber dispose 后技能必须自动注销。");

  await host.loadBundle("fixture", {
    packageRoot: fixtureRoot,
    packageName: "@mewvis/fixture-dsh-portable-application",
    patchPath: `${fixtureRoot}/cordis.patch.yml`,
    entrySpecifier: fixtureUrl,
  });
  assert.deepEqual(
    host.toolSchemas().map((tool) => tool.name),
    ["mewvis_dsh_echo"],
  );
} finally {
  await host.dispose();
}

assert.throws(() => host.toolSchemas(), /已经关闭/);

const createPersistentFixtureHost = async () => {
  const persistentHost = await DshCompatApplicationHost.create({ settingsPath });
  await persistentHost.loadBundle("fixture", {
    packageRoot: fixtureRoot,
    packageName: "@mewvis/fixture-dsh-portable-application",
    patchPath: `${fixtureRoot}/cordis.patch.yml`,
    entrySpecifier: fixtureUrl,
  });
  return persistentHost;
};

const firstPersistentHost = await createPersistentFixtureHost();
try {
  const result = await firstPersistentHost.executeTool({
    callId: "compat-settings-1",
    name: "mewvis_dsh_echo",
    arguments: { message: "first", prefix: "persisted" },
  });
  assert.equal(result.isError, false);
  if (!result.isError) assert.equal(result.value, "persisted:first");
} finally {
  await firstPersistentHost.dispose();
}

const secondPersistentHost = await createPersistentFixtureHost();
try {
  const result = await secondPersistentHost.executeTool({
    callId: "compat-settings-2",
    name: "mewvis_dsh_echo",
    arguments: { message: "second" },
  });
  assert.equal(result.isError, false);
  if (!result.isError) assert.equal(result.value, "persisted:second");
} finally {
  await secondPersistentHost.dispose();
}

const createNamespacedFixtureHost = async () => {
  const namespacedHost = await DshCompatApplicationHost.create({ settingsPath: settingsRoot });
  await namespacedHost.loadBundle("fixture", {
    packageRoot: fixtureRoot,
    packageName: "@mewvis/fixture-dsh-portable-application",
    patchPath: `${fixtureRoot}/cordis.patch.yml`,
    entrySpecifier: fixtureUrl,
  });
  return namespacedHost;
};

const firstNamespacedHost = await createNamespacedFixtureHost();
try {
  const initialized = await firstNamespacedHost.executeTool({
    callId: "compat-namespaced-settings-1",
    name: "mewvis_dsh_echo",
    arguments: { message: "initial" },
  });
  assert.equal(initialized.isError, false);
  if (!initialized.isError) assert.equal(initialized.value, "configured:initial");

  const updated = await firstNamespacedHost.executeTool({
    callId: "compat-namespaced-settings-2",
    name: "mewvis_dsh_echo",
    arguments: { message: "isolated", prefix: "isolated" },
  });
  assert.equal(updated.isError, false);
} finally {
  await firstNamespacedHost.dispose();
}

const namespaceFile = join(settingsRoot, "mewvis-fixture-portable", "settings.yaml");
assert.equal(existsSync(namespaceFile), true);
assert.match(readFileSync(namespaceFile, "utf8"), /prefix:\s+isolated/);

const secondNamespacedHost = await createNamespacedFixtureHost();
try {
  const persisted = await secondNamespacedHost.executeTool({
    callId: "compat-namespaced-settings-3",
    name: "mewvis_dsh_echo",
    arguments: { message: "restart" },
  });
  assert.equal(persisted.isError, false);
  if (!persisted.isError) assert.equal(persisted.value, "isolated:restart");
} finally {
  await secondNamespacedHost.dispose();
}

console.log("[app-host:dsh-compat] ok");
