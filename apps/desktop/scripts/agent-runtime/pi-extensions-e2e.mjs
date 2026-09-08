import assert from "node:assert/strict";
import { build } from "esbuild";
import { dshBundleCompatibilityPlugin } from "@isle/plugin-dev/dsh";
import { createServer } from "node:http";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temp = mkdtempSync(join(tmpdir(), "isle-pi-extensions-"));
const workspace = join(temp, "workspace");
const agentDir = join(temp, "agent");
mkdirSync(workspace);
mkdirSync(agentDir);
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
const root = join(desktop, "agent-runtime/src/engines/drivers/native/agent/runtimes/pi");
let server;
let created;

try {
  const bundle = join(temp, "test-api.mjs");
  await build({
    stdin: {
      contents: [
        `export * from ${JSON.stringify(join(root, "tools/sandbox.ts"))};`,
        `export * from ${JSON.stringify(join(root, "tools/subagent.ts"))};`,
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
  const api = await import(pathToFileURL(bundle).href);

  mkdirSync(join(agentDir, "extensions"));
  mkdirSync(join(workspace, ".pi"));
  const globalConfig = join(agentDir, "extensions/sandbox.json");
  const projectConfig = join(workspace, ".pi/sandbox.json");
  writeFileSync(globalConfig, JSON.stringify({ network: { allowedDomains: ["example.com"] } }));
  writeFileSync(projectConfig, JSON.stringify({ network: { allowedDomains: [] }, filesystem: { allowWrite: ["."] } }));
  const config = api.loadPiSandboxConfig(workspace, agentDir);
  assert.equal(config.enabled, true);
  assert.deepEqual(config.network.allowedDomains, []);
  assert.deepEqual(config.filesystem.allowWrite, [workspace]);
  writeFileSync(projectConfig, '{"enabled":"false"}');
  assert.throws(() => api.loadPiSandboxConfig(workspace, agentDir), /Invalid sandbox/);
  rmSync(projectConfig);
  rmSync(globalConfig);
  console.log("PASS sandbox configuration precedence, path resolution and validation");

  const outside = join(temp, "private");
  mkdirSync(outside);
  const secret = join(outside, "secret.txt");
  writeFileSync(secret, "private test content");
  const strictConfig = {
    ...config,
    filesystem: { denyRead: [outside], allowWrite: [workspace], denyWrite: [outside] },
  };
  const operations = api.createPiSandboxOperations(strictConfig);
  const exec = async (command, signal, timeout = 5) => {
    let output = "";
    const result = await operations.exec(command, workspace, {
      signal,
      timeout,
      onData: (chunk) => {
        output += chunk;
      },
    });
    return { ...result, output };
  };
  const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
  if (["darwin", "linux"].includes(process.platform)) {
    assert.equal((await exec("printf allowed > allowed.txt")).exitCode, 0);
    assert.equal(readFileSync(join(workspace, "allowed.txt"), "utf8"), "allowed");
    assert.notEqual((await exec(`cat ${quote(secret)}`)).exitCode, 0);
    assert.notEqual((await exec(`printf denied > ${quote(join(outside, "denied.txt"))}`)).exitCode, 0);
    assert.equal(existsSync(join(outside, "denied.txt")), false);
    let hits = 0;
    server = createServer((_request, response) => {
      hits++;
      response.end("unexpected");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    assert.notEqual((await exec(`curl --max-time 2 http://127.0.0.1:${server.address().port}`)).exitCode, 0);
    assert.equal(hits, 0);
    await new Promise((resolve) => server.close(resolve));
    server = null;

    const abort = new AbortController();
    const sleeping = exec("sleep 30", abort.signal);
    const waitingAbort = new AbortController();
    const waiting = exec("printf should-not-run > cancelled.txt", waitingAbort.signal);
    waitingAbort.abort();
    await assert.rejects(waiting);
    abort.abort();
    await assert.rejects(sleeping);
    assert.equal(existsSync(join(workspace, "cancelled.txt")), false);
    await assert.rejects(exec("sleep 30", undefined, 0.1), /timeout/);

    // Failed initialization must never execute the original command.
    const priorPath = process.env.PATH;
    process.env.PATH = "";
    try {
      await assert.rejects(exec("printf unsafe > bypass.txt"), /dependencies/i);
      assert.equal(existsSync(join(workspace, "bypass.txt")), false);
    } finally {
      process.env.PATH = priorPath;
    }
    assert.equal((await exec("printf recovered")).exitCode, 0, "locks/proxies must recover after failure");
    console.log("PASS OS sandbox: allowed write, denied read/write/network, abort, timeout and fail-closed recovery");
  } else {
    await assert.rejects(exec("echo unsupported"), /unavailable/);
    console.log("PASS unsupported OS rejects sandboxed bash");
  }

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
    if (messageText(last) === "parent-task") {
      send(
        {
          tool_calls: [
            {
              index: 0,
              id: "delegate-1",
              type: "function",
              function: { name: "subagent", arguments: JSON.stringify({ agent: "scout", task: "child-task" }) },
            },
          ],
        },
        "tool_calls",
      );
    } else if (messageText(last) === "sandbox-task") {
      send(
        {
          tool_calls: [
            {
              index: 0,
              id: "bash-1",
              type: "function",
              function: { name: "bash", arguments: JSON.stringify({ command: `cat ${quote(secret)}` }) },
            },
          ],
        },
        "tool_calls",
      );
    } else if (messageText(last) === "child-task") {
      send(
        {
          tool_calls: [
            {
              index: 0,
              id: "read-1",
              type: "function",
              function: { name: "read", arguments: JSON.stringify({ path: "fixture.txt" }) },
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
      reasoning: false,
    },
    resources: { tools: { allowed: ["read", "bash", "subagent"] } },
  };
  const callbacks = { requestUserInput: async () => assert.fail("children must not ask user") };
  created = await api.createPiAgentSession(command, callbacks, { sandboxConfig: strictConfig });
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
    assert.ok(!JSON.stringify(input.messages).includes("PARENT_HISTORY_SENTINEL"));
    assert.deepEqual(
      input.tools.map((tool) => tool.function.name),
      ["read"],
    );
  }
  assert.ok(JSON.stringify(childRequests[1].messages).includes("delegated file content"));
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
  const bashResult = events.find((event) => event.type === "tool_execution_end" && event.toolName === "bash");
  assert.ok(bashResult?.isError, "registered bash must enforce the sandbox");
  assert.ok(!JSON.stringify(bashResult).includes("private test content"));
  console.log("PASS Pi bash registration enforces sandbox restrictions");

  const runner = api.createPiSubagentRunner(command, callbacks, ["read", "subagent"], strictConfig);
  const controller = new AbortController();
  const running = runner({ agent: "worker", task: "wait-for-cancel" }, controller.signal, () => undefined);
  const rejection = assert.rejects(running);
  const deadline = Date.now() + 10_000;
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
