import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const servicePath = resolve(root, "agent-runtime/dist/plugin-host/service.mjs");
const pluginRoot = process.env.ISLE_TAVERN_PLUGIN_ROOT
  ? resolve(root, process.env.ISLE_TAVERN_PLUGIN_ROOT)
  : resolve(root, "plugin-host/plugins/tavern");
const pluginKind = process.env.ISLE_TAVERN_PLUGIN_KIND === "dsh" ? "dsh" : "isle";
const tempDir = mkdtempSync(join(tmpdir(), "isle-tavern-plugin-"));
const settingsRoot = join(tempDir, "plugins");
const legacySettingsRoot = join(settingsRoot, "isle-tavern");
const tavernSettingsRoot = join(settingsRoot, "@isle", "tavern");
mkdirSync(legacySettingsRoot, { recursive: true, mode: 0o700 });
writeFileSync(join(legacySettingsRoot, "settings.yaml"), 'activePresetId: ""\npresets: []\n', { mode: 0o600 });
execFileSync(process.execPath, [
  resolve("agent-runtime/dist/plugin-host/migrate-layout.mjs"),
  settingsRoot,
  "@isle/tavern",
]);
assert.equal(existsSync(legacySettingsRoot), false);
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
  const operation = pending.get(response.id);
  if (!operation) return;
  pending.delete(response.id);
  clearTimeout(operation.timer);
  if (response.error) operation.reject(new Error(response.error.message));
  else operation.resolve(response.result);
});

const request = (method, params = null) =>
  new Promise((resolveRequest, rejectRequest) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectRequest(new Error(`Tavern Plugin Host ${method} 请求超时。\n${stderr}`));
    }, 10_000);
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });

const configure = (settingsPath = settingsRoot) =>
  request("configure", {
    settingsPath,
    plugins: [
      {
        kind: pluginKind,
        id: "@isle/tavern",
        name: "酒馆",
        version: "0.1.0",
        description: "Tavern plugin E2E fixture",
        source: "bundled",
        entry: pathToFileURL(resolve(pluginRoot, "index.js")).href,
        packageRoot: pluginRoot,
        ...(pluginKind === "dsh" ? { patchPath: resolve(pluginRoot, "cordis.patch.yml") } : {}),
      },
    ],
  });

try {
  const configured = await configure();
  const plugin = configured.plugins[0];
  assert.equal(plugin.error, null);
  assert.equal(plugin.uiError, null);
  assert.deepEqual(plugin.ui, { kind: "sandbox", title: "酒馆工作台", layout: "full" });
  const uiDocument = await request("uiDocument", { pluginId: "@isle/tavern" });
  assert.match(uiDocument.script, /islePlugin\.executeTool\("tavern_list"/);
  assert.match(uiDocument.style, /\.tavern-app/);
  const toolNames = new Set(plugin.tools.map((tool) => tool.name));
  for (const toolName of ["tavern_list", "tavern_save", "tavern_remove", "tavern_activate", "tavern_context"]) {
    assert.equal(toolNames.has(toolName), true, `酒馆插件缺少 ${toolName}`);
  }

  const empty = await request("execute", {
    pluginId: "@isle/tavern",
    toolName: "tavern_list",
    arguments: {},
  });
  assert.deepEqual(empty.value, { count: 0, activePresetId: "", presets: [] });
  assert.match(
    readFileSync(join(tavernSettingsRoot, "settings.yaml"), "utf8"),
    /\$version:\s+1/,
    "旧版无版本设置必须在插件启动时迁移。",
  );

  const saved = await request("execute", {
    pluginId: "@isle/tavern",
    toolName: "tavern_save",
    arguments: {
      name: "雾港酒馆",
      description: "港口城的深夜角色扮演预设",
      characterName: "莉亚",
      characterDescription: "雾港酒馆的老板娘",
      personality: "冷静、敏锐，习惯用反问试探客人",
      scenario: "暴雨封锁了港口，酒馆里只剩最后三位客人",
      worldBook: "## 雾港\n魔法照明受到严格管制。",
      style: "dialogue",
    },
  });
  assert.equal(saved.value.created, true);
  assert.equal(saved.value.preset.characterName, "莉亚");
  assert.equal(saved.value.activePresetId, saved.value.preset.id);
  const presetId = saved.value.preset.id;

  const settingsPath = join(tavernSettingsRoot, "settings.yaml");
  assert.equal(existsSync(settingsPath), true, "酒馆设置必须保存到独立 namespace 目录。");
  assert.match(readFileSync(settingsPath, "utf8"), /雾港酒馆/);
  assert.equal(statSync(settingsPath).mode & 0o777, 0o600);
  assert.equal(statSync(tavernSettingsRoot).mode & 0o777, 0o700);
  assert.equal(existsSync(join(settingsRoot, "settings.yaml")), false, "新安装不应创建共享 settings 文件。");

  const context = await request("execute", {
    pluginId: "@isle/tavern",
    toolName: "tavern_context",
    arguments: {},
  });
  assert.equal(context.value.preset.id, presetId);
  assert.match(context.value.context, /莉亚/);
  assert.match(context.value.context, /魔法照明受到严格管制/);
  assert.match(context.value.context, /不要替用户决定关键行为/);

  await configure();
  const persisted = await request("execute", {
    pluginId: "@isle/tavern",
    toolName: "tavern_list",
    arguments: {},
  });
  assert.equal(persisted.value.count, 1, "酒馆预设必须跨 Host 重载持久化。");
  assert.equal(persisted.value.activePresetId, presetId);

  const second = await request("execute", {
    pluginId: "@isle/tavern",
    toolName: "tavern_save",
    arguments: { name: "第二预设", characterName: "诺拉", style: "grounded" },
  });
  await request("execute", {
    pluginId: "@isle/tavern",
    toolName: "tavern_activate",
    arguments: { id: second.value.preset.id },
  });
  const activated = await request("execute", {
    pluginId: "@isle/tavern",
    toolName: "tavern_list",
    arguments: {},
  });
  assert.equal(activated.value.activePresetId, second.value.preset.id);

  await request("execute", {
    pluginId: "@isle/tavern",
    toolName: "tavern_remove",
    arguments: { id: second.value.preset.id },
  });
  const removed = await request("execute", {
    pluginId: "@isle/tavern",
    toolName: "tavern_list",
    arguments: {},
  });
  assert.equal(removed.value.count, 1);
  assert.equal(removed.value.activePresetId, presetId);

  const newerSettingsRoot = join(tempDir, "newer-plugins");
  const newerTavernRoot = join(newerSettingsRoot, "isle-tavern");
  mkdirSync(newerTavernRoot, { recursive: true, mode: 0o700 });
  writeFileSync(join(newerTavernRoot, "settings.yaml"), '$version: 2\nactivePresetId: ""\npresets: []\n', {
    mode: 0o600,
  });
  execFileSync(process.execPath, [
    resolve("agent-runtime/dist/plugin-host/migrate-layout.mjs"),
    newerSettingsRoot,
    "@isle/tavern",
  ]);
  const incompatible = await configure(newerSettingsRoot);
  assert.match(incompatible.plugins[0].error, /uses newer version 2; plugin supports 1/);
  assert.match(readFileSync(join(newerSettingsRoot, "@isle", "tavern", "settings.yaml"), "utf8"), /\$version:\s+2/);

  await request("shutdown");
  child.stdin.end();
  const exitCode = await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((_, rejectExit) => setTimeout(() => rejectExit(new Error("Tavern Plugin Host 关闭超时。")), 5_000)),
  ]);
  assert.equal(exitCode, 0, stderr);
  console.log(`Tavern plugin E2E passed (${pluginKind}).`);
} finally {
  output.close();
  if (child.exitCode === null) child.kill();
  rmSync(tempDir, { recursive: true, force: true });
}
