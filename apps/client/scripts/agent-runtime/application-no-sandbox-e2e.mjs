import assert from "node:assert/strict";
import { build } from "esbuild";
import { dshBundleCompatibilityPlugin } from "@isle/app-dev/dsh";
import { once } from "node:events";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import entries from "../../../agent-runtime/build-entries.json" with { type: "json" };

const temp = realpathSync(mkdtempSync(join(tmpdir(), "isle-application-no-sandbox-")));
const previousSettingsPath = process.env.ISLE_SANDBOX_SETTINGS_PATH;
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.ISLE_SANDBOX_SETTINGS_PATH = join(temp, "sandbox.json");
process.env.PI_CODING_AGENT_DIR = join(temp, "agent");
// This choice is read by the same per-run settings path used on Windows.
writeFileSync(process.env.ISLE_SANDBOX_SETTINGS_PATH, '{"enabled":false}\n');
const workspace = join(temp, "workspace"),
  runtime = join(temp, "runtime"),
  application = join(temp, "application");
for (const path of [workspace, runtime, application, process.env.PI_CODING_AGENT_DIR]) mkdirSync(path);
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body);
  const callEcho =
    input.messages.at(-1).role === "user" && input.tools?.some((tool) => tool.function.name === "scope_echo");
  const delta = callEcho
    ? {
        tool_calls: [
          {
            index: 0,
            id: "echo",
            type: "function",
            function: {
              name: "scope_echo",
              arguments: '{"text":"application works"}',
            },
          },
        ],
      }
    : { content: "chat completed" };
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const [value, finish] of [
    [{ role: "assistant" }, null],
    [delta, callEcho ? "tool_calls" : "stop"],
  ])
    response.write(
      `data: ${JSON.stringify({
        id: "test",
        object: "chat.completion.chunk",
        created: 1,
        model: "isle-test",
        choices: [{ index: 0, delta: value, finish_reason: finish }],
      })}\n\n`,
    );
  response.end("data: [DONE]\n\n");
});

try {
  for (const name of [entries.executionHost.output, entries.piToolWorker.output])
    cpSync(resolve("../agent-runtime/dist", name), join(runtime, name));
  // No vendor sandbox helpers are available in this fixture.
  const apiFile = join(runtime, "api.mjs");
  await build({
    stdin: {
      contents: ["security/execution/index", "engines/drivers/native/agent/runtimes/pi/agent/session"]
        .map((name) => `export * from ${JSON.stringify(resolve(`../agent-runtime/src/${name}.ts`))};`)
        .join("\n"),
      resolveDir: process.cwd(),
      loader: "ts",
    },
    tsconfig: resolve("../agent-runtime/tsconfig.json"),
    outfile: apiFile,
    bundle: true,
    platform: "node",
    format: "esm",
    plugins: [dshBundleCompatibilityPlugin],
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
  });
  await build({
    stdin: {
      contents: `
        import { defineApplication, defineTool } from ${JSON.stringify(resolve("../../packages/app/sdk/index.js"))};
        import { execFileSync } from 'node:child_process';
        export default defineApplication({ name: 'scope-fixture', inject: ['tools'], apply(ctx) {
          for (const [name, risk, execute] of [
            ['scope_echo', 'low', (args) => args.text],
            ['scope_risky', 'high', () => 'approved'],
            ['scope_process', 'low', () => execFileSync(process.execPath, ['-e', 'console.log("spawned")'])],
          ]) ctx.tools.register(defineTool({ name, risk, description: name,
            parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
            output: { schema: {}, render: (_args, value) => [{ type: 'text', text: String(value) }] }, execute,
          }));
        }});`,
      resolveDir: process.cwd(),
      loader: "js",
    },
    outfile: join(application, "index.js"),
    bundle: true,
    platform: "node",
    format: "esm",
  });
  writeFileSync(join(application, "package.json"), '{"type":"module"}');
  const api = await import(pathToFileURL(apiFile).href);
  assert.equal((await api.getSandboxStatus()).state, "disabled");
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const command = {
    runtimeMode: "agent",
    taskId: "application-test",
    workspacePath: workspace,
    agentTaskPrompt: "Test application chat",
    userMessage: "hello",
    runtimeModel: {
      provider: "isle-test",
      modelId: "isle-test",
      catalogModelId: "isle-test",
      apiFormat: "openai-completions",
      apiEndpoint: `http://127.0.0.1:${server.address().port}/v1`,
      apiKey: "local-test-key",
      reasoning: false,
    },
  };
  for (const mode of ["ask", "auto", "full"]) {
    const approvals = [];
    const created = await api.createPiAgentSession(
      {
        ...command,
        permissions: { mode },
        agentAccess: { filesystem: { read: [{ base: "workspace" }], write: [{ base: "workspace" }] } },
        resources: {
          tools: { allowed: ["scope_echo", "scope_risky", "scope_process", "read", "write", "bash", "powershell"] },
          applications: {
            items: [
              { kind: "isle", id: "scope-fixture", entry: join(application, "index.js"), packageRoot: application },
            ],
          },
        },
      },
      {
        requestApproval: async (request) => {
          approvals.push(request.summary);
          return true;
        },
      },
    );
    try {
      await created.session.prompt("hello");
      assert.match(JSON.stringify(created.session.messages), /application works/);
      assert.match(JSON.stringify(created.session.messages.at(-1)), /chat completed/);
      const check = (name, args) =>
        created.session.agent.beforeToolCall(
          {
            toolCall: { id: "check", name },
            args,
          },
          new AbortController().signal,
        );
      assert.match((await check("read", { path: join(temp, "outside.txt") })).reason, /未申请文件读取权限/);
      const shell = created.session.agent.state.tools.find((tool) => ["bash", "powershell"].includes(tool.name));
      assert.ok(shell);
      assert.match((await check(shell.name, { command: "echo denied" })).reason, /未申请执行命令/);
      assert.equal(await check("scope_risky", { text: "risk" }), undefined);
      assert.equal(approvals.includes("scope_risky"), mode !== "full");
      const processTool = created.session.agent.state.tools.find((tool) => tool.name === "scope_process");
      await assert.rejects(processTool.execute("probe", { text: "probe" }), /Access|permission|denied/i);
    } finally {
      created.session.dispose();
      await created.disposeResources();
    }
  }
  console.log(
    "PASS application chat without sandbox helpers: real Pi tool roundtrip, all modes, access denials and Node process guard",
  );

  for (const name of ["learning", "story", "chat-playground"]) {
    const packageRoot = resolve("../applications/dist", name);
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    const created = await api.createPiAgentSession(
      {
        ...command,
        agentAccess: manifest.isle.agentAccess,
        permissions: { mode: "ask" },
        resources: {
          tools: { allowed: ["ask_user"] },
          applications: {
            items: [
              { kind: "isle", id: manifest.name, packageRoot, entry: join(packageRoot, manifest.isle.app.entry) },
            ],
          },
        },
      },
      { requestApproval: async () => assert.fail("chat initialization must not require approval") },
    );
    try {
      await created.session.prompt("hello");
      assert.match(JSON.stringify(created.session.messages.at(-1)), /chat completed/);
    } finally {
      created.session.dispose();
      await created.disposeResources();
    }
  }
  console.log("PASS Learning, Story and Chat Playground chat with their actual manifests and disabled sandbox");
} finally {
  server.closeAllConnections();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  if (previousSettingsPath === undefined) delete process.env.ISLE_SANDBOX_SETTINGS_PATH;
  else process.env.ISLE_SANDBOX_SETTINGS_PATH = previousSettingsPath;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(temp, { recursive: true, force: true });
}
