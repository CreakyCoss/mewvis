import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { packApplication } from "@mewvis/app-dev/tooling";
import { dshBundleCompatibilityPlugin } from "@mewvis/app-dev/dsh";
import { build } from "esbuild";

const source = dirname(fileURLToPath(import.meta.url));
const client = resolve(source, "../../../client");
const bundled = process.argv.includes("--bundled");
const builtinRoot = join(client, "../agent-runtime/dist/apps/chat-playground");
const { outputRoot, manifest } = bundled
  ? {
      outputRoot: builtinRoot,
      manifest: JSON.parse(
        await readFile(join(builtinRoot, "package.json"), "utf8"),
      ),
    }
  : await packApplication({ source });
assert.equal(manifest.mewvis.defaultEnabled, true);
assert.equal(manifest.dsh, undefined, "内置聊天应用必须使用 Mewvis 格式");
if (bundled) {
  for (const name of ["rss-reader", "docs-reader"]) {
    const portable = JSON.parse(
      await readFile(
        join(client, "../agent-runtime/dist/apps", name, "package.json"),
        "utf8",
      ),
    );
    assert.equal(
      portable.dsh.bundle.patch,
      "./cordis.patch.yml",
      `${name} 应保留原有 DSH 兼容产物`,
    );
  }
}
assert.equal(manifest.mewvis.ui.entry, "./mewvis-ui.js");
assert.equal(manifest.mewvis.ui.style, "./mewvis-ui.css");
assert.deepEqual(manifest.mewvis.permissions, [
  "chat",
  "workspace-files",
  "chat-knowledge",
  "application-workspaces",
  "application-data",
  "embedded-views",
  "open-external",
]);
assert.equal(
  (await readFile(join(outputRoot, "index.js"), "utf8")).includes("react-dom"),
  false,
);
const temporary = await mkdtemp(join(tmpdir(), "mewvis-chat-playground-"));
const child = spawn(
  process.execPath,
  [
    join(
      client,
      bundled
        ? "../agent-runtime/dist/app-host/service.mjs"
        : "../../packages/app/host/dist/service.mjs",
    ),
  ],
  {
    cwd: client,
    stdio: ["pipe", "pipe", "pipe"],
  },
);
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
  if (response.type === "application-chat:request") {
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
child.on("exit", () =>
  fail(new Error(`Application Host 已退出：${diagnostics}`)),
);
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
  const bridgeFile = join(temporary, "pi-application-bridge.mjs");
  await build({
    entryPoints: [
      join(
        client,
        "../agent-runtime/src/engines/drivers/native/agent/runtimes/pi/apps/bridge.ts",
      ),
    ],
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
          context.onResolve(
            { filter: /^@earendil-works\/pi-/ },
            ({ path }) => ({
              path: import.meta.resolve(path),
              external: true,
            }),
          );
        },
      },
      dshBundleCompatibilityPlugin,
    ],
    logLevel: "silent",
  });
  const { ApplicationRuntimeBridge } = await import(
    pathToFileURL(bridgeFile).href
  );
  const bridge = await ApplicationRuntimeBridge.create(
    [
      {
        kind: "mewvis",
        id: manifest.name,
        packageRoot: outputRoot,
        entry: join(outputRoot, "index.js"),
      },
    ],
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
    const tools = [];
    const risks = bridge.registerTools({
      registerTool: (tool) => tools.push(tool.name),
    });
    assert.deepEqual(tools.sort(), [
      "chat_playground_echo",
      "chat_playground_inspect_text",
      "chat_playground_medium_risk",
    ]);
    assert.deepEqual(
      [...risks],
      [
        ["chat_playground_echo", "low"],
        ["chat_playground_inspect_text", "low"],
        ["chat_playground_medium_risk", "medium"],
      ],
    );
  } finally {
    await bridge.dispose();
  }
  await assert.rejects(access(skillFile), { code: "ENOENT" });
  const configured = await rpc("configure", {
    settingsPath: temporary,
    applications: [
      {
        kind: "mewvis",
        id: manifest.name,
        name: manifest.mewvis.displayName,
        version: manifest.version,
        description: manifest.description,
        source: "bundled",
        packageRoot: outputRoot,
        entry: join(outputRoot, "index.js"),
        permissions: manifest.mewvis.permissions,
        permissionStatus: "declared",
      },
    ],
  });
  const application = configured.applications[0];
  assert.equal(application.error, null);
  assert.equal(application.uiError, null);
  assert.deepEqual(
    application.tools.map((tool) => tool.risk),
    ["low", "low", "medium"],
  );
  assert.deepEqual(
    application.tools.map((tool) => tool.name),
    [
      "chat_playground_echo",
      "chat_playground_inspect_text",
      "chat_playground_medium_risk",
    ],
  );
  const document = await rpc("uiDocument", { applicationId: manifest.name });
  assert.ok(Buffer.byteLength(document.script) < 512 * 1024);
  assert.ok(Buffer.byteLength(document.style) < 256 * 1024);
  assert.match(document.script, /mewvisApplicationChatUI/);
  assert.match(document.style, /lab-custom-chat/);
  const result = await rpc("execute", {
    applicationId: manifest.name,
    toolName: "chat_playground_echo",
    arguments: { text: "Mewvis 👋" },
  });
  assert.deepEqual(result.value, { echo: "Mewvis 👋", characters: 8 });
  assert.match(result.content[0].text, /Mewvis 👋/);
  const mediumResult = await rpc("execute", {
    applicationId: manifest.name,
    toolName: "chat_playground_medium_risk",
    arguments: { text: "中风险审批测试" },
  });
  assert.deepEqual(mediumResult.value, {
    echo: "中风险审批测试",
    characters: 7,
  });
  const inspection = await rpc("execute", {
    applicationId: manifest.name,
    toolName: "chat_playground_inspect_text",
    arguments: { text: "Mewvis 👋" },
  });
  assert.deepEqual(inspection.value, {
    text: "Mewvis 👋",
    characters: 8,
    bytes: 11,
    sha256: createHash("sha256").update("Mewvis 👋").digest("hex"),
    runtime: "node",
  });
  await assert.rejects(
    rpc("execute", {
      applicationId: manifest.name,
      toolName: "chat_playground_inspect_text",
      arguments: { text: "" },
    }),
    /text|length|字符/i,
  );

  await assert.rejects(
    rpc("execute", {
      applicationId: manifest.name,
      toolName: "chat_playground_echo",
      arguments: {},
    }),
    /text|字符/,
  );
  await assert.rejects(
    rpc("execute", {
      applicationId: manifest.name,
      toolName: "chat_playground_echo",
      arguments: { text: "x", extra: true },
    }),
    /extra|additional/i,
  );
  assert.equal(
    chatRequests.some((request) => ["open", "send"].includes(request.method)),
    false,
    "应用初始化和回显不得自动调用模型",
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
