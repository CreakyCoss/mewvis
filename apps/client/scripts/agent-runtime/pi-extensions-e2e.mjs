import assert from "node:assert/strict";
import { build } from "esbuild";
import { dshBundleCompatibilityPlugin } from "@isle/app-dev/dsh";
import { createServer } from "node:http";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import entries from "../../../agent-runtime/build-entries.json" with { type: "json" };

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temp = mkdtempSync(join(tmpdir(), "isle-pi-extensions-"));
const workspace = join(temp, "workspace");
const agentDir = join(temp, "agent");
mkdirSync(workspace);
mkdirSync(agentDir);
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
const root = join(desktop, "../agent-runtime/src/engines/drivers/native/agent/runtimes/pi");
let server;
let created;

try {
  // Match the desktop layout: the bundled worker lives in dist/ beside a source package.
  const runtime = join(temp, "dist");
  mkdirSync(runtime);
  const bundle = join(runtime, "test-api.mjs");
  for (const name of [entries.executionHost.output, entries.piToolWorker.output, "vendor"])
    cpSync(join(desktop, "../agent-runtime/dist", name), join(runtime, name), { recursive: true });
  await build({
    tsconfig: join(desktop, "../agent-runtime/tsconfig.json"),
    stdin: {
      contents: [
        `export * from ${JSON.stringify(join(desktop, "../agent-runtime/src/security/safety/index.ts"))};`,
        `export * from ${JSON.stringify(join(desktop, "../agent-runtime/src/security/execution/index.ts"))};`,
        `export * from ${JSON.stringify(join(desktop, "../agent-runtime/src/engines/drivers/native/index.ts"))};`,
        `export * from ${JSON.stringify(join(root, "../../commands/user-input.ts"))};`,
        `export * from ${JSON.stringify(join(root, "tools/subagent.ts"))};`,
        `export * from ${JSON.stringify(join(root, "tools/index.ts"))};`,
        `export * from ${JSON.stringify(join(root, "agent/session.ts"))};`,
        `export * from ${JSON.stringify(join(root, "agent/subagent-session.ts"))};`,
      ].join("\n"),
      resolveDir: desktop,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: bundle,
    plugins: [dshBundleCompatibilityPlugin],
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
  });
  const require = createRequire(import.meta.url);
  const sandboxRoot = dirname(require.resolve("@anthropic-ai/sandbox-runtime/package.json"));
  cpSync(join(sandboxRoot, "vendor"), join(temp, "vendor"), { recursive: true });
  writeFileSync(
    join(temp, "package.json"),
    JSON.stringify({ name: "pi-extensions-test", type: "module", piConfig: { name: "pi", configDir: ".pi" } }),
  );
  cpSync(join(temp, "package.json"), join(runtime, "package.json"));
  const api = await import(pathToFileURL(bundle).href);

  const outside = join(temp, "private");
  mkdirSync(outside);
  const secret = join(outside, "secret.txt");
  writeFileSync(secret, "private test content");
  const approvalOnlyFile = join(workspace, "approval-only.txt");
  writeFileSync(approvalOnlyFile, "approval-only content");
  const protectFiles = (targets, enabled = true) => ({
    ...api.SAFETY_CONFIG,
    enabled,
    rules(context) {
      const roots = targets.map(context.resolvePath);
      return [
        ...api.SAFETY_CONFIG.rules(context),
        {
          id: "test.protected-files",
          description: "Test additional file rule",
          scope: "operation",
          evaluate({ operation }) {
            if (
              operation?.kind === "filesystem" &&
              roots.some(
                (root) =>
                  operation.target === root ||
                  operation.target.startsWith(root + (process.platform === "win32" ? "\\" : "/")),
              )
            )
              return { risk: "high", effect: "deny", reason: "Test protected file" };
          },
        },
      ];
    },
  });
  const strictPolicies = {
    safety: api.resolveSafetyPolicy("ask", workspace, protectFiles([outside])),
    execution: api.resolveExecutionPolicy("ask", workspace),
  };
  strictPolicies.execution.sandbox.filesystem.denyRead.push(outside);
  strictPolicies.execution.sandbox.filesystem.denyWrite.push(outside);
  const quote = (text) =>
    `'${(process.platform === "win32" ? text.replaceAll("\\", "/") : text).replaceAll("'", "'\\''")}'`;

  assert.deepEqual(api.subagentAllowedTools(["read", "write", "bash", "subagent", "ask_user"], "scout"), ["read"]);
  assert.deepEqual(api.subagentAllowedTools(["read", "subagent", "ask_user"], "worker"), ["read"]);
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 8 }, (_, index) => ({ agent: "worker", task: String(index) }));
  const parallel = await api.runPiSubagentTasks({ tasks }, async (task) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
    return { agent: task.agent, text: task.task, isError: false };
  });
  assert.equal(peak, 4);
  assert.deepEqual(
    parallel.map((result) => result.text),
    tasks.map((task) => task.task),
  );
  const prompts = [];
  const chain = await api.runPiSubagentTasks(
    {
      chain: [
        { agent: "scout", task: "first" },
        { agent: "planner", task: "plan {previous}" },
        { agent: "worker", task: "never" },
      ],
    },
    async (task) => {
      prompts.push(task.task);
      return { agent: task.agent, text: "findings", isError: task.agent === "planner" };
    },
  );
  assert.deepEqual(prompts, ["first", "plan findings"]);
  assert.equal(chain.length, 2);
  await assert.rejects(
    api.runPiSubagentTasks({ tasks, chain: tasks }, () => assert.fail()),
    /exactly one/,
  );
  await assert.rejects(
    api.runPiSubagentTasks({ agent: "unknown", task: "bad" }, () => assert.fail()),
    /Each task/,
  );
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(api.runPiSubagentTasks({ tasks }, () => assert.fail(), cancelled.signal));
  console.log("PASS subagent permission intersection, concurrency, chain, validation and cancellation");

  // Use the real Pi SDK and a local streaming model endpoint, with no paid API.
  const requests = [];
  const deferredRequests = [];
  const messageText = (message) =>
    typeof message.content === "string"
      ? message.content
      : (message.content ?? []).map((part) => part.text ?? "").join("");
  server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    requests.push(input);
    const last = input.messages.at(-1);
    const nativeApprovalTask = last.role === "user" && messageText(last).match(/native-approval-(parent|write)/)?.[1];
    const child = input.messages.some((message) => message.role === "user" && messageText(message) === "child-task");
    if (messageText(last) === "wait-for-cancel") {
      deferredRequests.push(response);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = (delta, finishReason = null) =>
      response.write(
        `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "isle-test", choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`,
      );
    send({ role: "assistant" });
    if (nativeApprovalTask) {
      send(
        {
          tool_calls: [
            {
              index: 0,
              id: "native-approval-call",
              type: "function",
              function:
                nativeApprovalTask === "parent"
                  ? { name: "subagent", arguments: JSON.stringify({ agent: "worker", task: "native-approval-write" }) }
                  : {
                      name: "write",
                      arguments: JSON.stringify({ path: "native-approved.txt", content: "approved content" }),
                    },
            },
          ],
        },
        "tool_calls",
      );
    } else if (["parent-task", "matrix-parent"].includes(messageText(last))) {
      send(
        {
          tool_calls: [
            {
              index: 0,
              id: "delegate-1",
              type: "function",
              function: {
                name: "subagent",
                arguments: JSON.stringify(
                  messageText(last) === "matrix-parent"
                    ? { agent: "worker", task: "sandbox-task" }
                    : { agent: "scout", task: "child-task" },
                ),
              },
            },
          ],
        },
        "tool_calls",
      );
    } else if (["sandbox-task", "policy-task"].includes(messageText(last))) {
      send(
        {
          tool_calls: [
            {
              index: 0,
              id: "bash-1",
              type: "function",
              function: {
                name: "bash",
                arguments: JSON.stringify({
                  command: messageText(last) === "policy-task" ? "printf policy-test > .env" : `cat ${quote(secret)}`,
                }),
              },
            },
          ],
        },
        "tool_calls",
      );
    } else if (["child-task", "child-outside", "approval-scope"].includes(messageText(last))) {
      send(
        {
          tool_calls: [
            {
              index: 0,
              id: "read-1",
              type: "function",
              function: {
                name: "read",
                arguments: JSON.stringify({
                  path:
                    messageText(last) === "approval-scope"
                      ? approvalOnlyFile
                      : messageText(last) === "child-outside"
                        ? secret
                        : "fixture.txt",
                }),
              },
            },
          ],
        },
        "tool_calls",
      );
    } else {
      send({ content: child ? "child complete" : "parent complete" }, "stop");
    }
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  writeFileSync(join(workspace, "fixture.txt"), "delegated file content");
  const command = {
    runtimeMode: "agent",
    taskId: "parent",
    workspacePath: workspace,
    agentTaskPrompt: "parent-task",
    userMessage: "parent-task",
    agentSessionDir: join(temp, "parent-session"),
    runtimeModel: {
      provider: "openai",
      modelId: "isle-test",
      catalogModelId: "isle-test",
      apiFormat: "openai-completions",
      apiEndpoint: `http://127.0.0.1:${server.address().port}/v1`,
      apiKey: "local-test-key",
      reasoning: true,
      thinkingLevel: "provider-custom",
    },
    resources: { tools: { allowed: ["read", "bash", "subagent"] } },
  };
  const callbacks = {
    requestUserInput: async () => assert.fail("children must not ask user"),
    requestApproval: async () => true,
  };
  // Enter through the public engine, so omitted callbacks cannot be hidden by
  // directly supplying an approval handler to a Pi session.
  for (const scope of ["write", "parent"]) {
    for (const approved of [false, true]) {
      const target = join(workspace, "native-approved.txt");
      const taskId = `native-approval-${scope}-${approved}`;
      const engineEvents = [];
      const answers = [];
      let existedBeforeApproval;
      const engine = api.createNativeRuntimeEngine({
        callbacks: {
          requestUserInput: async () => assert.fail("approval must not use ask_user"),
          onEvent(event) {
            engineEvents.push(event);
            if (event.type === "approval_requested") {
              existedBeforeApproval = existsSync(target);
              answers.push(
                engine.handle({
                  type: "answer_approval",
                  taskId: event.taskId,
                  approvalId: event.approvalId,
                  approved,
                }),
              );
            }
          },
        },
      });
      try {
        const result = await engine.agent.run({
          taskId,
          workspacePath: workspace,
          userMessage: `native-approval-${scope}`,
          runtimeModel: command.runtimeModel,
          resources: { tools: { allowed: ["write", "subagent"] } },
          permissions: { mode: "ask" },
        });
        await Promise.all(answers);
        assert.equal(result.success, true, JSON.stringify(engineEvents));
        const requested = engineEvents.filter((event) => event.type === "approval_requested");
        assert.equal(requested.length, 1, `native ${scope} must expose approval through the engine event channel`);
        assert.equal(requested[0].taskId, taskId, "child approvals retain the root task identity");
        assert.equal(requested[0].summary, "write");
        assert.equal(existedBeforeApproval, false, "the tool must wait before writing");
        assert.deepEqual(
          engineEvents.filter((event) => event.type === "approval_resolved").map((event) => event.approved),
          [approved],
        );
        assert.equal(existsSync(target), approved, "only an approved invocation may write");
        if (approved) assert.equal(readFileSync(target, "utf8"), "approved content");
      } finally {
        rmSync(target, { force: true });
      }
    }
  }
  console.log("PASS native engine approval events and answers gate real main/subagent writes");
  const settingsRoot = join(temp, "read-only-application-settings");
  mkdirSync(join(settingsRoot, "isle-fixture-portable"), { recursive: true });
  writeFileSync(join(settingsRoot, "settings.yaml"), "{}\n");
  writeFileSync(join(settingsRoot, "isle-fixture-portable", "settings.yaml"), "prefix: saved\n");
  const fixtureRoot = join(desktop, "../../packages/app/host/fixtures/dsh-portable-application");
  const applicationExecution = api.resolveExecutionPolicy("ask", workspace);
  applicationExecution.sandbox.filesystem.denyWrite.push(settingsRoot);
  const applicationTools = await api.createPiToolSet(
    {
      ...command,
      resources: {
        tools: { allowed: ["isle_dsh_echo"] },
        applications: {
          settingsPath: settingsRoot,
          items: [
            {
              kind: "dsh",
              id: "@isle/fixture-dsh-portable-application",
              packageRoot: fixtureRoot,
              entry: join(fixtureRoot, "index.js"),
              patchPath: join(fixtureRoot, "cordis.patch.yml"),
            },
          ],
        },
      },
    },
    callbacks,
    { policies: { safety: api.resolveSafetyPolicy("ask", workspace), execution: applicationExecution } },
  );
  try {
    const tool = applicationTools.tools.find((tool) => tool.name === "isle_dsh_echo");
    assert.ok(tool);
    const result = await tool.execute("settings-read", { message: "loaded" });
    assert.equal(result.details.value, "saved:loaded");
    assert.equal(readFileSync(join(settingsRoot, "settings.yaml"), "utf8"), "{}\n");
    assert.equal(existsSync(join(settingsRoot, "settings.yaml.lock")), false);
    assert.equal(existsSync(join(settingsRoot, "settings.yaml.pre-namespace-migration.bak")), false);
  } finally {
    await applicationTools.dispose();
  }
  console.log("PASS sandboxed application settings initialize and read without legacy migration or writes");
  const scopedApplicationRoot = api.canonicalPath(join(temp, "scoped-application"));
  mkdirSync(scopedApplicationRoot);
  writeFileSync(join(scopedApplicationRoot, "package.json"), '{"type":"module"}');
  await build({
    stdin: {
      contents: `
      import { defineApplication, defineTool } from ${JSON.stringify(resolve(desktop, "../../packages/app/sdk/index.js"))};
      export default defineApplication({ name: 'scope-fixture', inject: ['tools', 'skills'], apply(ctx) {
        ctx.skills.register({ name: 'scope-fixture', description: 'In-memory skill', content: 'Use scope_echo to echo text.', source: 'bundled' });
        ctx.tools.register(defineTool({ name: 'scope_echo', risk: 'low', description: 'Echo without side effects',
          parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          output: { schema: {}, render: (_args, value) => [{ type: 'text', text: value }] },
          execute: async (args) => args.text,
        }));
      }});
    `,
      resolveDir: desktop,
      loader: "js",
    },
    outfile: join(scopedApplicationRoot, "index.js"),
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const scopedApplication = await api.createPiToolSet(
    {
      ...command,
      permissions: { mode: "ask" },
      agentAccess: {},
      resources: {
        tools: { allowed: ["scope_echo"] },
        applications: {
          settingsPath: settingsRoot,
          items: [
            {
              kind: "isle",
              id: "scope-fixture",
              packageRoot: scopedApplicationRoot,
              entry: join(scopedApplicationRoot, "index.js"),
            },
          ],
        },
      },
    },
    { ...callbacks, requestApproval: () => assert.fail("enabled application initialization must not prompt") },
  );
  try {
    const session = { agent: {} };
    scopedApplication.installSafety(session);
    assert.equal(
      await session.agent.beforeToolCall(
        {
          toolCall: { id: "low-risk", name: "scope_echo" },
          args: { text: "ok" },
        },
        new AbortController().signal,
      ),
      undefined,
      "registered low-risk application tools do not prompt in ask mode",
    );
    assert.equal(
      scopedApplication.applications.skills.length,
      1,
      "declared application skills must load without broad temporary-directory access",
    );
    assert.equal(
      (await scopedApplication.tools.find((tool) => tool.name === "scope_echo").execute("echo", { text: "ok" })).details
        .value,
      "ok",
    );
  } finally {
    await scopedApplication.dispose();
  }
  console.log("PASS application startup, memory settings and declared skills with an empty Agent access grant");
  const storyWorkspace = join(temp, "story-workspace");
  const storyWorkspaceId = "11111111-1111-4111-8111-111111111111";
  const storyPackageRoot = join(desktop, "../applications/dist/story");
  const storyManifest = JSON.parse(readFileSync(join(storyPackageRoot, "package.json"), "utf8"));
  mkdirSync(join(storyWorkspace, ".isle"), { recursive: true });
  writeFileSync(join(storyWorkspace, ".isle", "workspace.json"),
    JSON.stringify({ version: 1, id: storyWorkspaceId, applications: ["@isle/story"] }));
  const storyTools = await api.createPiToolSet({
    ...command,
    workspacePath: storyWorkspace,
    permissions: { mode: "ask" },
    agentAccess: storyManifest.isle.agentAccess,
    resources: {
      tools: { allowed: ["isle_story_inspect"] },
      applications: { items: [{
        kind: "isle", id: "@isle/story", packageRoot: storyPackageRoot,
        entry: join(storyPackageRoot, storyManifest.isle.app.entry),
      }] },
    },
  }, callbacks);
  try {
    const inspect = storyTools.tools.find((tool) => tool.name === "isle_story_inspect");
    assert.equal((await inspect.execute("story-inspect", { workspaceId: storyWorkspaceId })).details.value.status,
      "empty");
    await assert.rejects(inspect.execute("wrong-workspace", { workspaceId: "22222222-2222-4222-8222-222222222222" }),
      /未登记/);
  } finally {
    await storyTools.dispose();
  }
  console.log("PASS built-in Story tools start and resolve their registered workspace under Agent access");
  await assert.rejects(
    api.createPiToolSet(
      {
        ...command,
        resources: {
          applications: {
            items: [
              {
                kind: "isle",
                id: "bootstrap-test",
                packageRoot: workspace,
                entry: "missing-application.js",
                config: { apiKey: "PRIVATE_CONFIGURATION_SENTINEL" },
              },
            ],
          },
        },
      },
      {
        ...callbacks,
        requestApproval: () => assert.fail("application initialization does not request approval"),
      },
    ),
    /missing-application/,
  );
  console.log("PASS enabled application initialization and declared low-risk calls do not prompt; missing code still fails");
  created = await api.createPiAgentSession(command, callbacks, { policies: strictPolicies });
  assert.ok(created.session.getActiveToolNames().includes("subagent"));
  const events = [];
  created.session.subscribe((event) => events.push(event));
  await created.session.prompt("PARENT_HISTORY_SENTINEL");
  await created.session.prompt("parent-task");
  const childRequests = requests.filter((input) =>
    input.messages.some((message) => messageText(message) === "child-task"),
  );
  assert.equal(
    childRequests.length,
    2,
    JSON.stringify({
      requests: requests.map((input) => input.messages.at(-1)),
      events: events.filter((event) => ["message_end", "tool_execution_end"].includes(event.type)),
    }),
  );
  for (const input of childRequests) {
    assert.equal(input.model, "isle-test");
    assert.equal(input.reasoning_effort, "provider-custom", "subagents inherit the selected thinking level");
    assert.ok(!JSON.stringify(input.messages).includes("PARENT_HISTORY_SENTINEL"));
    assert.deepEqual(
      input.tools.map((tool) => tool.function.name),
      ["read"],
    );
  }
  assert.ok(JSON.stringify(childRequests[1].messages).includes("delegated file content"));
  assert.ok(requests.every((input) => input.reasoning_effort === "provider-custom"));
  assert.ok(events.some((event) => event.type === "tool_execution_update" && event.toolName === "subagent"));
  const delegation = events.find((event) => event.type === "tool_execution_end" && event.toolName === "subagent");
  assert.equal(delegation.isError, false);
  assert.equal(delegation.result.details.results[0].text, "child complete");
  assert.ok(delegation.result.details.results[0].usage);
  const parentMessages = JSON.stringify(created.session.messages);
  assert.ok(!parentMessages.includes("delegated file content"), "child tool transcript must not enter parent history");
  console.log(
    "PASS real Pi delegation: registration, isolated history, inherited model/tools, file tool, progress and result",
  );

  await created.session.prompt("sandbox-task");
  const bashResults = events.filter((event) => event.type === "tool_execution_end" && event.toolName === "bash");
  assert.equal(bashResults.length, 1, "approval resumes the original call without a model retry");
  const bashResult = bashResults.at(-1);
  assert.ok(bashResult?.isError, "registered bash must enforce the sandbox");
  assert.ok(!JSON.stringify(bashResult).includes("private test content"));
  console.log("PASS Pi bash registration enforces sandbox restrictions");

  created.session.dispose();
  await created.disposeResources();
  created = undefined;

  for (const mode of ["ask", "full"]) {
    const policySession = await api.createPiAgentSession(
      { ...command, agentSessionDir: null, permissions: { mode } },
      callbacks,
    );
    try {
      await policySession.session.prompt("policy-task");
      const written =
        existsSync(join(workspace, ".env")) && readFileSync(join(workspace, ".env"), "utf8") === "policy-test";
      assert.equal(
        written,
        mode === "full",
        "writes must follow the selected profile; Windows deny placeholders do not count as a successful write",
      );
    } finally {
      policySession.session.dispose();
      await policySession.disposeResources();
    }
  }
  rmSync(join(workspace, ".env"), { force: true });
  console.log("PASS real Pi applies profile-specific filesystem boundaries");

  for (const safetyEnabled of [true, false]) {
    for (const sandboxEnabled of [true, false]) {
      const safetyConfig = protectFiles([approvalOnlyFile], safetyEnabled);
      const executionConfig = structuredClone(api.EXECUTION_CONFIG);
      executionConfig.enabled = sandboxEnabled;
      executionConfig.baseline.denyRead.push(outside);
      // Disabled isolation must not initialize or validate SRT's installed restrictions.
      if (!sandboxEnabled) executionConfig.backend.options.protectedFileNames = [];
      const policies = {
        safety: api.resolveSafetyPolicy("ask", workspace, api.validateSafetyConfig(safetyConfig)),
        execution: api.resolveExecutionPolicy("ask", workspace, api.validateExecutionConfig(executionConfig)),
      };
      let approvalCount = 0;
      const matrix = await api.createPiAgentSession(
        { ...command, agentSessionDir: null, permissions: { mode: "ask" } },
        {
          ...callbacks,
          requestApproval: async (request) => {
            assert.equal(request.taskId, command.taskId);
            approvalCount++;
            return true;
          },
        },
        { policies },
      );
      const matrixEvents = [];
      matrix.session.subscribe((event) => matrixEvents.push(event));
      try {
        const before = requests.length;
        await matrix.session.prompt("matrix-parent");
        assert.equal(approvalCount, safetyEnabled ? 1 : 0, "child inherits the approval switch");
        assert.equal(
          JSON.stringify(requests.slice(before)).includes("private test content"),
          !sandboxEnabled,
          "child inherits OS isolation independently of approval",
        );
        await matrix.session.prompt("approval-scope");
        const read = matrixEvents.find((event) => event.type === "tool_execution_end" && event.toolName === "read");
        assert.equal(Boolean(read?.isError), safetyEnabled, "pre-call boundaries are independent of sandbox scope");
        assert.equal(JSON.stringify(read).includes("approval-only content"), !safetyEnabled);
      } finally {
        matrix.session.dispose();
        await matrix.disposeResources();
      }
    }
  }
  console.log("PASS all four approval/sandbox combinations through real Pi and inherited subagent policies");

  const scoped = await api.createPiAgentSession(
    {
      ...command,
      agentSessionDir: null,
      permissions: { mode: "full" },
      agentAccess: { filesystem: { read: [{ base: "workspace" }] } },
    },
    { ...callbacks, requestApproval: async () => assert.fail("approval cannot widen a declared scope") },
  );
  try {
    const before = requests.length;
    await scoped.session.prompt("matrix-parent");
    assert.ok(
      !JSON.stringify(requests.slice(before)).includes("private test content"),
      "child inherits the declaration even in full mode",
    );
    assert.ok(JSON.stringify(requests.slice(before)).includes("未申请执行命令"), "child must retain process denial");
    await scoped.session.prompt("child-outside");
    assert.ok(
      JSON.stringify(scoped.session.messages).includes("未申请文件读取权限"),
      "file access outside the scope must be denied",
    );
    await scoped.session.prompt("sandbox-task");
    assert.match(JSON.stringify(scoped.session.messages), /未申请执行命令/);
  } finally {
    scoped.session.dispose();
    await scoped.disposeResources();
  }
  console.log("PASS real Pi full mode and child agents retain the manifest access ceiling");

  const approvals = [];
  const inputManager = api.createUserInputManager((event) => approvals.push(event));
  const approvalRunner = api.createPiSubagentRunner(command, inputManager.callbacks, ["read"], {
    safety: api.resolveSafetyPolicy("ask", workspace),
    execution: api.resolveExecutionPolicy("ask", workspace),
  });
  const approvalAbort = new AbortController();
  const waitingChild = approvalRunner({ agent: "scout", task: "child-outside" }, approvalAbort.signal, () => undefined);
  const waitingRejection = assert.rejects(waitingChild);
  const approvalDeadline = Date.now() + 60_000;
  while (!approvals.length && Date.now() < approvalDeadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(approvals[0]?.type, "approval_requested");
  assert.equal(approvals[0]?.taskId, command.taskId, "child approvals belong to the root task");
  approvalAbort.abort();
  await waitingRejection;
  assert.equal(approvals.at(-1).type, "approval_resolved");
  assert.equal(approvals.at(-1).approved, false);
  console.log("PASS real child approval inherits root identity and is cancelled with its parent");

  const runner = api.createPiSubagentRunner(command, callbacks, ["read", "subagent"], strictPolicies);
  const controller = new AbortController();
  const running = runner({ agent: "worker", task: "wait-for-cancel" }, controller.signal, () => undefined);
  const rejection = assert.rejects(running);
  const deadline = Date.now() + 60_000;
  while (!deferredRequests.length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(deferredRequests.length, 1);
  controller.abort();
  await rejection;
  for (const response of deferredRequests) response.destroy();
  console.log("PASS real Pi child session abort and cleanup");
} finally {
  if (created) {
    await created.session.abort();
    created.session.dispose();
    await created.disposeResources();
  }
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(temp, { recursive: true, force: true });
}
