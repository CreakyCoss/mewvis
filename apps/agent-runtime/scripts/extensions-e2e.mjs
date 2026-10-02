import assert from "node:assert/strict";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { dshBundleCompatibilityPlugin } from "@mewvis/app-dev/dsh";
import entries from "../build-entries.json" with { type: "json" };
import { verifyExtensionAdapters } from "./extensions-adapter-test.mjs";
import { verifyExtensionSessions } from "./extensions-session-test.mjs";
import { verifyExtensionMiddleware } from "./extensions-middleware-test.mjs";
import { verifyExtensionEvents } from "./extensions-events-test.mjs";
import { verifyExtensionCollaboration } from "./extensions-collaboration-test.mjs";
import { verifyExtensionCompaction } from "./extensions-compaction-test.mjs";
import { verifyExtensionServices } from "./extensions-service-test.mjs";
import { verifyExtensionWait } from "./extensions-wait-test.mjs";

// Self-contained demo/test: actual Pi SDK, actual execution workers and local SSE model.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(join(tmpdir(), "mewvis-extension-loop-"));
const dist = join(temp, "dist");
const workspace = join(temp, "workspace");
const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = join(temp, "pi");
const requests = [];
let server;
const engines = [];

try {
  await mkdir(workspace);
  await mkdir(dist);
  await mkdir(process.env.PI_CODING_AGENT_DIR);
  const manifest = JSON.stringify({
    type: "module",
    name: "mewvis-extension-test",
    piConfig: { name: "pi", configDir: ".pi" },
  });
  await writeFile(join(temp, "package.json"), manifest);
  await writeFile(join(dist, "package.json"), manifest);
  await build({
    entryPoints: [
      ...["extensionWorker", "executionHost", "piToolWorker"].map((id) => ({
        in: join(root, entries[id].source),
        out: entries[id].output.slice(0, -3),
      })),
      { in: join(root, "src/index.ts"), out: "api" },
      { in: fileURLToPath(import.meta.resolve("@mewvis/extension-host/agent/registration")), out: "host" },
      { in: join(root, "src/extensions/execution/deadline.ts"), out: "extension-deadline" },
      { in: join(root, "src/engines/drivers/native/agent/runtimes/pi/agent/idle-timeout.ts"), out: "pi-idle-timeout" },
      { in: join(root, "src/engines/drivers/native/agent/runtimes/pi/agent/session.ts"), out: "pi-session" },
      { in: join(root, "src/engines/drivers/native/agent/artifacts.ts"), out: "agent-artifacts" },
      { in: join(root, "src/engines/drivers/native/agent/runtimes/pi/extensions/index.ts"), out: "pi-adapter" },
      { in: join(root, "src/engines/drivers/native/agent/runtimes/mock/extensions/index.ts"), out: "mock-adapter" },
      { in: join(root, "src/engines/drivers/native/agent/runtimes/mock/extensions/registry.ts"), out: "mock-registry" },
    ],
    outdir: dist,
    tsconfig: join(root, "tsconfig.json"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    plugins: [dshBundleCompatibilityPlugin],
    banner: {
      js: "import { createRequire as __extensionCreateRequire } from 'node:module'; const require = __extensionCreateRequire(import.meta.url);",
    },
  });
  const require = createRequire(import.meta.url);
  const echoEntry = join(temp, "echo.mjs");
  await writeFile(echoEntry, `export default {id:'test.echo',protocolVersion:1,setup(ctx){
    let calls = 0;
    ctx.registerTool({name:'echo',label:'Echo',description:'Echo input',
      parameters:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false},
      async execute(input,{progress}){const value={echo:input.text,calls:++calls};progress({content:[{type:'text',text:'working'}],details:{}});return {content:[{type:'text',text:JSON.stringify(value)}],details:value}}
    });
    ctx.registerSkill({name:'echo_guidance',description:'Echo guidance',content:'Always repeat the input exactly.'});
  }};`);
  const sandboxRoot = dirname(require.resolve("@anthropic-ai/sandbox-runtime/package.json"));
  await cp(join(sandboxRoot, "vendor"), join(dist, "vendor"), { recursive: true });
  const api = await import(pathToFileURL(join(dist, "api.js")).href);
  await verifyExtensionWait({
    ...await import(pathToFileURL(join(dist, "extension-deadline.js")).href),
    ...await import(pathToFileURL(join(dist, "pi-idle-timeout.js")).href),
  });
  const hostApi = await import(pathToFileURL(join(dist, "host.js")).href);
  await verifyExtensionAdapters({
    ...await import(pathToFileURL(join(dist, "pi-adapter.js")).href),
    ...await import(pathToFileURL(join(dist, "mock-adapter.js")).href),
    ...await import(pathToFileURL(join(dist, "mock-registry.js")).href),
  });
  const toolName = "ext_test_echo__echo";
  const source = { id: "test.echo", entry: echoEntry, toolRisks: { echo: "low" } };
  const script = [{ type: "tool", name: toolName, input: { text: "你好🌍\nMewvis" } }];
  const mock = api.createScriptedMockRuntime("scripted", script);
  const registry = api.createRuntimeAgentRegistry([...api.builtinRuntimeAgents, mock]);
  const events = [];
  const context = {
    emit: (event) => events.push(event),
    callbacks: { requestUserInput: async () => assert.fail("unexpected user input") },
  };
  const command = {
    runtimeMode: "agent",
    runtimeId: "scripted",
    taskId: "mock-demo",
    workspacePath: workspace,
    userMessage: "请复述文本",
    permissions: { mode: "ask" },
    resources: { tools: { allowed: [toolName] } },
  };
  const engine = api.createAgentEngine({ registry, getExtensionSources: () => [source] });
  engines.push(engine);

  assert.throws(() => api.createRuntimeAgentRegistry([mock, mock], "scripted"), /重复/);
  assert.throws(() => api.createRuntimeAgentRegistry([mock], "missing"), /默认/);
  assert.throws(() => registry.resolve("toString"), /未配置/);
  await assert.rejects(
    () => api.createAgentEngine({ getExtensionSources: () => [source, source] }).runAgent(command, context),
    /重复插件/,
  );
  await assert.rejects(() => engine.runAgent({ ...command, runtimeId: "mock" }, context), /不支持 Mewvis 插件/);
  const result = await engine.runAgent(command, context);
  assert.deepEqual(JSON.parse(result.text), { echo: script[0].input.text, calls: 1 });
  assert.ok(events.some((event) => event.type === "tool_execution_update"));
  const mockToolResult = events.find((event) => event.type === "tool_execution_end").result;
  console.log("PASS Mock → 插件工具 → 真实 worker：", result.text);

  const parallel = await Promise.all(
    ["one", "two"].map((taskId) => engine.runAgent({ ...command, taskId }, { ...context, emit() {} })),
  );
  assert.ok(parallel.every((item) => JSON.parse(item.text).calls === 1));
  await assert.rejects(() => engine.runAgent({ ...command, resources: { tools: { allowed: [] } } }, context), /未启用/);
  const invalid = api.createScriptedMockRuntime("invalid", [{ type: "tool", name: toolName, input: { text: 7 } }]);
  await assert.rejects(
    () =>
      api
        .createAgentEngine({ registry: api.createRuntimeAgentRegistry([invalid], "invalid"), getExtensionSources: () => [source] })
        .runAgent({ ...command, runtimeId: "invalid" }, context),
    /参数无效/,
  );

  let approvals = 0;
  const unknownRiskEngine = api.createAgentEngine({ registry, getExtensionSources: () => [{ ...source, toolRisks: undefined }] });
  await assert.rejects(
    () =>
      unknownRiskEngine.runAgent(command, {
        ...context,
        callbacks: {
          ...context.callbacks,
          requestApproval: async () => {
            approvals++;
            return false;
          },
        },
      }),
    /未授权/,
  );
  assert.equal(approvals, 1);
  const accepted = await unknownRiskEngine.runAgent(command, {
    ...context,
    callbacks: {
      ...context.callbacks,
      requestApproval: async () => {
        approvals++;
        return true;
      },
    },
  });
  assert.equal(JSON.parse(accepted.text).calls, 1);
  assert.equal(approvals, 2);
  console.log("PASS 注册冲突、能力检查、参数校验、工具白名单、审批拒绝/通过、并发状态隔离");

  // Lifecycle fixture also exercises cancellation after execution has begun.
  const fixtureDir = join(temp, "plugins", "lifecycle");
  await mkdir(fixtureDir, { recursive: true });
  const fixtureEntry = join(fixtureDir, "index.mjs");
  await writeFile(
    fixtureEntry,
    `
    import { writeFile } from 'node:fs/promises';
    import { join } from 'node:path';
    export default { id: 'test.lifecycle', protocolVersion: 1, setup(ctx) {
      ctx.own(() => writeFile(join(ctx.workspacePath, 'disposed'), 'yes'));
      ctx.registerTool({ name: 'wait', label: 'Wait', description: 'Wait until cancelled',
        parameters: {type:'object', properties:{}, additionalProperties:false},
        async execute(input, {progress}) {
          progress({content:[{type:'text',text:'ready'}],details:{}});
          await new Promise(resolve => setTimeout(resolve, 30000));
          await writeFile(join(ctx.workspacePath, 'too-late'), 'bad');
          return {content:[],details:{}};
        }
      });
    }};
  `,
  );
  const lifecycleSource = { id: "test.lifecycle", entry: fixtureEntry, toolRisks: { wait: "low" } };
  const lifecycle = await hostApi.createExtensionHost([lifecycleSource], workspace);
  await lifecycle.dispose();
  assert.equal(await readFile(join(workspace, "disposed"), "utf8"), "yes");
  await rm(join(workspace, "disposed"));
  // Failed setup/activation must release resources owned by already assembled facets.
  const failingEntry = join(fixtureDir, "failure.mjs");
  await writeFile(
    failingEntry,
    `
    import { writeFile } from 'node:fs/promises';
    import { join } from 'node:path';
    export default {id:'test.failure',protocolVersion:1,setup(ctx){
      ctx.own(() => writeFile(join(ctx.workspacePath,'failed-disposed'),'yes'));
      ctx.onActivate(() => {throw new Error('activation failed')});
    }};
  `,
  );
  await assert.rejects(
    () => hostApi.createExtensionHost([{ id: "test.failure", entry: failingEntry }], workspace),
    /activation failed/,
  );
  assert.equal(await readFile(join(workspace, "failed-disposed"), "utf8"), "yes");
  await assert.rejects(() => hostApi.createExtensionHost([{ ...source, id: "wrong.id" }], workspace), /身份或 API/);
  const duplicateEntry = join(fixtureDir, "duplicate.mjs");
  await writeFile(
    duplicateEntry,
    `export default {id:'test.duplicate',protocolVersion:1,setup(ctx){
    const tool={name:'same',label:'Same',description:'Same',parameters:{type:'object'},async execute(){return {content:[],details:{}}}};
    ctx.registerTool(tool);ctx.registerTool(tool);
  }};`,
  );
  await assert.rejects(
    () => hostApi.createExtensionHost([{ id: "test.duplicate", entry: duplicateEntry }], workspace),
    /名称冲突/,
  );
  const cancelMock = api.createScriptedMockRuntime("cancel", [
    { type: "tool", name: "ext_test_lifecycle__wait", input: {} },
  ]);
  const cancelEngine = api.createAgentEngine({
    registry: api.createRuntimeAgentRegistry([cancelMock], "cancel"),
    getExtensionSources: () => [lifecycleSource],
  });
  const abort = new AbortController();
  await assert.rejects(
    () =>
      cancelEngine.runAgent(
        { ...command, runtimeId: "cancel", resources: undefined },
        {
          ...context,
          signal: abort.signal,
          emit(event) {
            if (event.type === "tool_execution_update") abort.abort();
          },
        },
      ),
    /取消|abort/i,
  );
  await assert.rejects(() => readFile(join(workspace, "too-late")), { code: "ENOENT" });
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(() => engine.runAgent(command, { ...context, signal: stopped.signal }), /abort/i);
  console.log("PASS 生命周期释放、执行中取消和启动前取消");

  // A plugin's import-time code is already inside the same OS sandbox as its tools.
  const privateDir = join(temp, "private");
  await mkdir(privateDir);
  const secret = join(privateDir, "secret.txt");
  await writeFile(secret, "must not be visible");
  const scopedEntry = join(fixtureDir, "scoped.mjs");
  await writeFile(
    scopedEntry,
    `
    import {readFile} from 'node:fs/promises';
    let blocked=false;
    try {await readFile(${JSON.stringify(secret)},'utf8')} catch {blocked=true}
    export default {id:'test.scoped',protocolVersion:1,setup(ctx){
      if(!blocked) throw new Error('initialization escaped sandbox');
      ctx.registerTool({name:'probe',label:'Probe',description:'Probe sandbox',parameters:{type:'object'},
        async execute(){
          try {await readFile(${JSON.stringify(secret)},'utf8')} catch {
            return {content:[{type:'text',text:'blocked'}],details:{blocked:true}};
          }
          throw new Error('execution escaped sandbox');
        }
      });
    }};
  `,
  );
  const scopedMock = api.createScriptedMockRuntime("scoped", [
    { type: "tool", name: "ext_test_scoped__probe", input: {} },
  ]);
  const scopedEngine = api.createAgentEngine({
    registry: api.createRuntimeAgentRegistry([scopedMock], "scoped"),
    getExtensionSources: () => [{ id: "test.scoped", entry: scopedEntry, toolRisks: { probe: "low" } }],
  });
  const scoped = await scopedEngine.runAgent(
    {
      ...command,
      runtimeId: "scoped",
      resources: undefined,
      agentAccess: {
        filesystem: { read: [{ base: "workspace" }], write: [] },
        network: { hosts: [] },
        process: { execute: false },
      },
    },
    context,
  );
  assert.equal(scoped.text, "blocked");
  console.log("PASS 插件初始化和执行均受真实 OS 沙箱约束");

  // The actual Pi agent must advertise the tool, invoke it, and consume its result.
  server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    requests.push(input);
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const last = input.messages.at(-1);
    const toolReply = last.role === "tool";
    const sessionProbe = input.tools?.find((tool) => tool.function.name === "ext_test_session__probe_tool");
    const delta = toolReply
      ? { content: "Pi 已读取插件结果" }
      : {
          tool_calls: [
            {
              index: 0,
              id: "extension-call",
              type: "function",
              function: { name: sessionProbe?.function.name ?? toolName, arguments: sessionProbe ? "{}" : JSON.stringify(script[0].input) },
            },
          ],
        };
    response.write(
      `data: ${JSON.stringify({ id: "demo", object: "chat.completion.chunk", created: 1, model: "local", choices: [{ index: 0, delta, finish_reason: toolReply ? "stop" : "tool_calls" }] })}\n\n`,
    );
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const piCommand = {
    ...command,
    runtimeId: "pi",
    taskId: "pi-demo",
    agentRoleId: "main",
    sessionRootDir: join(workspace, "session"),
    runtimeModel: {
      provider: "openai",
      modelId: "local",
      catalogModelId: "local",
      apiFormat: "openai-completions",
      apiEndpoint: `http://127.0.0.1:${server.address().port}/v1`,
      apiKey: "test-key",
      reasoning: false,
    },
  };
  events.length = 0;
  const piResult = await engine.runAgent(piCommand, context);
  assert.equal(piResult.text, "Pi 已读取插件结果");
  assert.equal(requests.length, 2);
  assert.ok(requests[0].tools.some((tool) => tool.function.name === toolName));
  assert.match(JSON.stringify(requests[0].messages), /Always repeat the input exactly/);
  assert.match(JSON.stringify(requests[1].messages.at(-1)), /echo/);
  const piToolResult = events.find((event) => event.type === "tool_execution_end" && event.toolName === toolName);
  assert.equal(piToolResult.isError, false);
  assert.deepEqual(piToolResult.result, mockToolResult);
  console.log("PASS Pi SDK → 同一插件工具 → 同一结果；技能进入模型上下文");

  // Pi's existing safety hook must delegate exactly once to the shared extension gate.
  const requestCount = requests.length;
  let piApprovals = 0;
  events.length = 0;
  await unknownRiskEngine.runAgent(
    { ...piCommand, taskId: "pi-denied", sessionRootDir: undefined },
    {
      ...context,
      callbacks: {
        ...context.callbacks,
        requestApproval: async () => {
          piApprovals++;
          return false;
        },
      },
    },
  );
  assert.equal(piApprovals, 1);
  const deniedTool = events.find((event) => event.type === "tool_execution_end");
  assert.equal(deniedTool.isError, true);
  assert.match(JSON.stringify(requests.at(-1).messages.at(-1)), /未授权/);
  assert.equal(requests.length, requestCount + 2);
  console.log("PASS Pi 插件审批拒绝；不会重复审批或执行被拒绝的调用");

  // Public SDK registration and session recorder work together; no global registry mutation.
  const sdkEvents = [];
  const sdk = api.createAgentRuntime({
    runtimeAgents: [mock],
    extensions: [source],
    callbacks: { onEvent: (event) => sdkEvents.push(event) },
  });
  const task = await sdk.agent.run({
    ...command,
    taskId: "sdk-demo",
    agentRoleId: "mock-role",
    sessionRootDir: join(workspace, "sdk-session"),
  });
  assert.equal(task.success, true);
  const session = await sdk.session.admin.read({
    workspacePath: workspace,
    sessionRootDir: join(workspace, "sdk-session"),
  });
  assert.match(JSON.stringify(session), /echo/);
  const plainSdk = api.createAgentRuntime();
  const missing = await plainSdk.agent.run({ ...command, taskId: "isolated-registry" });
  assert.equal(missing.success, false);
  assert.match(missing.message, /未配置 runtime agent/);
  await sdk.shutdown();
  await plainSdk.shutdown();
  console.log("PASS 公共 SDK 接入、会话落盘、注册表实例隔离");
  const { createPiAgentSession } = await import(pathToFileURL(join(dist, "pi-session.js")).href);
  await verifyExtensionServices({ api, workspace, hostApi });
  await verifyExtensionCollaboration({ api, root, workspace, piCommand });
  await verifyExtensionSessions({ api, workspace, command, piCommand });
  await verifyExtensionMiddleware({ api, workspace, command, piCommand });
  await verifyExtensionEvents({ api, hostApi, workspace, command, piCommand });
  await verifyExtensionCompaction({ api, workspace, piCommand, createPiAgentSession, ...await import(pathToFileURL(join(dist, "agent-artifacts.js")).href) });
  console.log("插件小闭环全部通过（无需外部模型账号）。");
} finally {
  await Promise.all(engines.map((engine) => engine.dispose()));
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
  await rm(temp, { recursive: true, force: true });
}
