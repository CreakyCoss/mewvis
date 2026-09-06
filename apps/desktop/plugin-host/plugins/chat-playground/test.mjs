import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { packPlugin } from "@isle/plugin-dev/tooling";
import { dshBundleCompatibilityPlugin } from "@isle/plugin-dev/dsh";
import { build } from "esbuild";

const source = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(source, "../../..");
const bundled = process.argv.includes("--bundled");
const builtinRoot = join(desktop, "agent-runtime/dist/plugins/chat-playground");
const { outputRoot, manifest } = bundled
  ? { outputRoot: builtinRoot, manifest: JSON.parse(await readFile(join(builtinRoot, "package.json"), "utf8")) }
  : await packPlugin({ source });
assert.equal(manifest.isle.defaultEnabled, true);
assert.equal(manifest.dsh, undefined, "内置聊天插件必须使用 Isle 格式");
if (bundled) {
  for (const name of ["rss-reader", "tavern", "story-scene-card"]) {
    const portable = JSON.parse(
      await readFile(join(desktop, "agent-runtime/dist/plugins", name, "package.json"), "utf8"),
    );
    assert.equal(portable.dsh.bundle.patch, "./cordis.patch.yml", `${name} 应保留原有 DSH 兼容产物`);
  }
}
assert.equal(manifest.isle.ui.entry, "./isle-ui.js");
assert.equal(manifest.isle.ui.style, "./isle-ui.css");
assert.deepEqual(manifest.isle.permissions, ["chat", "workspace-files", "chat-knowledge"]);
assert.equal((await readFile(join(outputRoot, "index.js"), "utf8")).includes("react-dom"), false);
const temporary = await mkdtemp(join(tmpdir(), "isle-chat-playground-"));
const child = spawn(process.execPath, [join(desktop, "agent-runtime/dist/plugin-host/service.mjs")], {
  cwd: desktop,
  stdio: ["pipe", "pipe", "pipe"],
});
const output = createInterface({ input: child.stdout });
let diagnostics = "";
let nextId = 0;
const pending = new Map();
const chatRequests = [];
const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
child.stderr.on("data", (value) => (diagnostics += String(value)));
output.on("line", (line) => {
  let response;
  try {
    response = JSON.parse(line);
  } catch {
    return;
  }
  if (response.type === "plugin-chat:request") {
    chatRequests.push(response.request);
    return;
  }
  const operation = pending.get(response.id);
  if (!operation) return;
  pending.delete(response.id);
  clearTimeout(operation.timer);
  if (response.error) operation.reject(new Error(response.error.message));
  else operation.resolve(response.result);
});
const fail = (error) => {
  pending.forEach((operation) => {
    clearTimeout(operation.timer);
    operation.reject(error);
  });
  pending.clear();
};
child.on("error", fail);
child.on("exit", () => fail(new Error(`Plugin Host 已退出：${diagnostics}`)));
const rpc = (method, params = null) =>
  new Promise((resolveRpc, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} 超时：${diagnostics}`));
    }, 10000);
    pending.set(id, { resolve: resolveRpc, reject, timer });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
try {
  // Exercise the actual host registry and Pi skill materialization without a model or user data.
  const bridgeFile = join(temporary, "pi-plugin-bridge.mjs");
  await build({
    entryPoints: [join(desktop, "agent-runtime/src/engines/drivers/native/agent/runtimes/pi/plugins/bridge.ts")],
    outfile: bridgeFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    banner: {
      js: 'import { createRequire as __testCreateRequire } from "node:module"; const require = __testCreateRequire(import.meta.url);',
    },
    plugins: [
      {
        name: "test-pi-packages",
        setup(context) {
          context.onResolve({ filter: /^@earendil-works\/pi-/ }, ({ path }) => ({
            path: import.meta.resolve(path),
            external: true,
          }));
        },
      },
      dshBundleCompatibilityPlugin,
    ],
    logLevel: "silent",
  });
  const { PluginRuntimeBridge } = await import(pathToFileURL(bridgeFile).href);
  const bridge = await PluginRuntimeBridge.create(
    [{ kind: "isle", id: manifest.name, packageRoot: outputRoot, entry: join(outputRoot, "index.js") }],
    temporary,
    join(temporary, "pi-settings"),
  );
  let skillFile;
  try {
    assert.equal(bridge.skills.length, 1);
    const skill = bridge.skills[0];
    assert.equal(skill.name, "chat-playground-text-inspection");
    assert.equal(skill.disableModelInvocation, false);
    skillFile = skill.filePath;
    const content = await readFile(skillFile, "utf8");
    assert.match(content, /chat_playground_inspect_text/);
    assert.match(content, /Unicode 码点/);
    assert.match(content, /不要自行编造/);
    let beforeAgentStart;
    let activeTools = ["chat_playground_inspect_text"];
    const extension = {
      getActiveTools: () => activeTools,
      on(event, handler) {
        assert.equal(event, "before_agent_start");
        beforeAgentStart = handler;
      },
    };
    bridge.registerSkills(extension, bridge.skills);
    const context = await beforeAgentStart({ systemPrompt: "Original system prompt" });
    assert.ok(context.systemPrompt.startsWith("Original system prompt\n\n"));
    assert.ok(context.systemPrompt.includes(content));
    assert.deepEqual(activeTools, ["chat_playground_inspect_text"], "Skill loading must not grant tools");
    activeTools = ["read", "chat_playground_inspect_text"];
    assert.equal(await beforeAgentStart({ systemPrompt: "Original system prompt" }), undefined);
    activeTools = ["chat_playground_inspect_text"];
    bridge.registerSkills(extension, []);
    assert.equal(
      await beforeAgentStart({ systemPrompt: "Original system prompt" }),
      undefined,
      "Filtered skills must stay excluded",
    );
  } finally {
    await bridge.dispose();
  }
  await assert.rejects(access(skillFile), { code: "ENOENT" });
  const configured = await rpc("configure", {
    settingsPath: temporary,
    plugins: [
      {
        kind: "isle",
        id: manifest.name,
        name: manifest.isle.displayName,
        version: manifest.version,
        description: manifest.description,
        source: "bundled",
        packageRoot: outputRoot,
        entry: join(outputRoot, "index.js"),
        permissions: manifest.isle.permissions,
        permissionStatus: "declared",
      },
    ],
  });
  const plugin = configured.plugins[0];
  assert.equal(plugin.error, null);
  assert.equal(plugin.uiError, null);
  assert.deepEqual(
    plugin.tools.map((tool) => tool.name),
    ["chat_playground_echo", "chat_playground_inspect_text"],
  );
  const document = await rpc("uiDocument", { pluginId: manifest.name });
  assert.ok(Buffer.byteLength(document.script) < 512 * 1024);
  assert.ok(Buffer.byteLength(document.style) < 256 * 1024);
  assert.match(document.script, /islePluginChatUI/);
  assert.match(document.style, /lab-custom-chat/);
  const result = await rpc("execute", {
    pluginId: manifest.name,
    toolName: "chat_playground_echo",
    arguments: { text: "Isle 👋" },
  });
  assert.deepEqual(result.value, { echo: "Isle 👋", characters: 6 });
  assert.match(result.content[0].text, /Isle 👋/);
  const inspection = await rpc("execute", {
    pluginId: manifest.name,
    toolName: "chat_playground_inspect_text",
    arguments: { text: "Isle 👋" },
  });
  assert.deepEqual(inspection.value, {
    text: "Isle 👋",
    characters: 6,
    bytes: 9,
    sha256: createHash("sha256").update("Isle 👋").digest("hex"),
    runtime: "node",
  });
  await assert.rejects(
    rpc("execute", { pluginId: manifest.name, toolName: "chat_playground_inspect_text", arguments: { text: "" } }),
    /text|length|字符/i,
  );

  await assert.rejects(
    rpc("execute", { pluginId: manifest.name, toolName: "chat_playground_echo", arguments: {} }),
    /text|字符/,
  );
  await assert.rejects(
    rpc("execute", {
      pluginId: manifest.name,
      toolName: "chat_playground_echo",
      arguments: { text: "x", extra: true },
    }),
    /extra|additional/i,
  );
  assert.equal(
    chatRequests.some((request) => ["open", "send"].includes(request.method)),
    false,
    "插件初始化和回显不得自动调用模型",
  );
  await rpc("shutdown");
  child.stdin.end();
  assert.equal(await exited, 0, diagnostics);
  console.log(
    `Chat playground ${bundled ? "built-in" : "package"} + Node host E2E passed (UI ${Buffer.byteLength(document.script)} B; CSS ${Buffer.byteLength(document.style)} B).`,
  );
} finally {
  output.close();
  if (child.exitCode === null) {
    child.kill();
    await exited;
  }
  await rm(temporary, { recursive: true, force: true });
}
