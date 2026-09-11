import entries from "../../agent-runtime/build-entries.json" with { type: "json" };
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const desktopRoot = process.cwd();
const runtimePath = join(desktopRoot, "agent-runtime/dist", entries.cli.output);
const fixturesRoot = join(desktopRoot, "agent-runtime/protocol/v1/fixtures");
const protocolRoot = join(desktopRoot, "agent-runtime/protocol/v1");
const workspacePath = mkdtempSync(join(tmpdir(), "isle-agent-runtime-protocol-"));

if (!existsSync(runtimePath)) {
  throw new Error(`${runtimePath} 不存在，请先运行 pnpm build:agent-runtime`);
}

const fixture = (kind, name) => JSON.parse(readFileSync(join(fixturesRoot, kind, `${name}.json`), "utf8"));

const validatorBundle = await build({
  entryPoints: [join(desktopRoot, "agent-runtime/src/cli/json-rpc.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const validators = await import(
  `data:text/javascript;base64,${Buffer.from(validatorBundle.outputFiles[0].text).toString("base64")}`
);
const protocolSdkBundle = await build({
  entryPoints: [join(protocolRoot, "sdk/typescript/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const protocolSdk = await import(
  `data:text/javascript;base64,${Buffer.from(protocolSdkBundle.outputFiles[0].text).toString("base64")}`
);
const stdioBundle = await build({
  entryPoints: [join(desktopRoot, "agent-runtime/src/cli/stdio.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { AgentRuntimeStdioProtocol } = await import(
  `data:text/javascript;base64,${Buffer.from(stdioBundle.outputFiles[0].text).toString("base64")}`
);

const openRpcDocument = JSON.parse(readFileSync(join(protocolRoot, "openrpc.json"), "utf8"));
const requestSchema = JSON.parse(readFileSync(join(protocolRoot, "schema/request.schema.json"), "utf8"));
const eventSchema = JSON.parse(readFileSync(join(protocolRoot, "schema/event.schema.json"), "utf8"));
const resultSchema = JSON.parse(readFileSync(join(protocolRoot, "schema/result.schema.json"), "utf8"));
const documentedCommandMethods = openRpcDocument.methods
  .filter((method) => method["x-isle-command"])
  .map((method) => method.name)
  .sort();
const validatedCommandMethods = Object.values(requestSchema.definitions)
  .map((definition) => definition?.properties?.method?.const)
  .filter(Boolean)
  .sort();
assert.deepEqual(
  validatedCommandMethods,
  documentedCommandMethods,
  "OpenRPC command methods 必须与 JSON Schema request variants 完全一致",
);
const schemaEventTypes = [
  ...new Set(
    Object.values(eventSchema.definitions)
      .map((definition) => definition?.properties?.type?.const)
      .filter((value) => typeof value === "string"),
  ),
].sort();
assert.deepEqual(
  Object.values(protocolSdk.AgentRuntimeEventType).sort(),
  schemaEventTypes,
  "Protocol SDK event constants 必须与 event Schema 完全一致",
);
const sdkTextDelta = protocolSdk.agentRuntimeEvents.textDelta({
  taskId: "sdk-task",
  delta: "hello",
});
assert.deepEqual(sdkTextDelta, {
  type: "text_delta",
  taskId: "sdk-task",
  delta: "hello",
});
assert.equal(protocolSdk.agentRuntimeEventGuards.textDelta(sdkTextDelta), true);
assert.equal(protocolSdk.agentRuntimeEventGuards.done(sdkTextDelta), false);
assert.equal(validators.validateRuntimeEvent(sdkTextDelta).valid, true);
const schemaResultTypes = [
  ...new Set(
    Object.values(resultSchema.definitions)
      .map((definition) => definition?.properties?.type?.const)
      .filter((value) => typeof value === "string"),
  ),
].sort();
assert.deepEqual(
  Object.values(protocolSdk.AgentRuntimeResultType).sort(),
  schemaResultTypes,
  "Protocol SDK result constants 必须与 result Schema 完全一致",
);
const sdkChatResult = protocolSdk.agentRuntimeResults.chatResult({ text: "hello" });
assert.deepEqual(sdkChatResult, { type: "chat_result", text: "hello" });
assert.equal(protocolSdk.agentRuntimeResultGuards.chatResult(sdkChatResult), true);
assert.equal(protocolSdk.agentRuntimeResultGuards.taskResult(sdkChatResult), false);
assert.equal(validators.validateRuntimeResult(sdkChatResult).valid, true);
assert.equal(validators.validateJsonRpcRequest(fixture("valid", "ping-request")).valid, true);
assert.equal(validators.validateJsonRpcRequest(fixture("valid", "run-agent-request")).valid, true);
const sdkRunRequest = protocolSdk.agentRuntimeRequests.agentRun(
  "sdk-run",
  fixture("valid", "run-agent-request").params,
);
assert.equal(validators.validateJsonRpcRequest(sdkRunRequest).valid, true);
const runRequestWithModel = fixture("valid", "run-agent-request");
runRequestWithModel.params.runtimeModel = {
  provider: "openai",
  apiFormat: "openai-responses",
  catalogModelId: "gpt-5",
  modelId: "gpt-5",
  thinkingLevel: "high",
  input: ["text", "image"],
};
assert.equal(validators.validateJsonRpcRequest(runRequestWithModel).valid, true);
runRequestWithModel.params.runtimeModel.apiFormat = "legacy-custom-format";
assert.equal(
  validators.validateJsonRpcRequest(runRequestWithModel).valid,
  false,
  "runtimeModel 必须由共享 model Schema 校验",
);
assert.equal(validators.validateJsonRpcRequest(fixture("invalid", "run-agent-missing-task-id")).valid, false);
assert.equal(validators.validateJsonRpcRequest(fixture("invalid", "unknown-method")).valid, false);
assert.throws(
  () => validators.createRuntimeNotification("runtime/event", { type: "text_delta", delta: "missing task id" }),
  /不符合 agent runtime wire schema/,
  "出站 notification 必须经过 Schema 校验",
);
assert.throws(
  () => validators.createJsonRpcSuccessResponse("invalid-result", { type: "unknown_result" }),
  /不符合 agent runtime wire schema/,
  "出站 response 必须经过 Schema 校验",
);

const multiplexedOutput = [];
const multiplexedProtocol = new AgentRuntimeStdioProtocol((value) => multiplexedOutput.push(value));
const multiplexedRunRequest = fixture("valid", "run-agent-request");
const multiplexedRunCommand = multiplexedProtocol.parseCommand(JSON.stringify(multiplexedRunRequest));
multiplexedProtocol.beginCommand(multiplexedRunCommand);
multiplexedProtocol.endCommand(multiplexedRunCommand);
const multiplexedPingCommand = multiplexedProtocol.parseCommand(
  JSON.stringify({
    jsonrpc: "2.0",
    id: "multiplexed-heartbeat",
    method: "runtime/ping",
    params: {},
  }),
);
multiplexedProtocol.beginCommand(multiplexedPingCommand);
multiplexedProtocol.writeEvent({
  type: "error",
  taskId: "task-1",
  message: "asynchronous task failure",
});
multiplexedProtocol.writeResult({
  type: "pong",
  requestId: multiplexedPingCommand.requestId,
});
multiplexedProtocol.endCommand(multiplexedPingCommand);
assert.ok(
  multiplexedOutput.some(
    (item) => item.method === "runtime/event" && item.params?.message === "asynchronous task failure",
  ),
  "异步任务错误不能被错误归属为当前 heartbeat response",
);
assert.ok(
  multiplexedOutput.some((item) => item.id === "multiplexed-heartbeat" && item.result?.type === "pong"),
  "并发任务事件不能吞掉 heartbeat response",
);

const createHarness = () => {
  const child = spawn(process.execPath, [runtimePath], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      AGENT_RUNTIME_PROFILE_ID: "mock",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const seen = [];
  const waiters = [];
  let stdoutBuffer = "";
  let stderrBuffer = "";

  const handleLine = (line) => {
    if (!line.trim()) return;
    const parsed = JSON.parse(line);
    seen.push(parsed);
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(parsed)) continue;
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(parsed);
    }
  };

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
      handleLine(stdoutBuffer.slice(0, newlineIndex));
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    }
  });
  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString("utf8");
  });

  const waitFor = (predicate, label, timeoutMs = 10_000) =>
    new Promise((resolve, reject) => {
      const existing = seen.find(predicate);
      if (existing) {
        resolve(existing);
        return;
      }
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(
            new Error(
              `等待 ${label} 超时\nstderr:\n${stderrBuffer}\nseen:\n${JSON.stringify(seen.slice(-12), null, 2)}`,
            ),
          );
        }, timeoutMs),
      };
      waiters.push(waiter);
    });

  return {
    child,
    seen,
    send(value) {
      child.stdin.write(`${JSON.stringify(value)}\n`);
    },
    waitFor,
    async close() {
      if (!child.killed && child.exitCode === null) child.stdin.end();
      await new Promise((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once("exit", resolve);
      });
    },
  };
};

const rpc = createHarness();

try {
  rpc.send(fixture("invalid", "run-agent-missing-task-id"));
  const invalidParams = await rpc.waitFor(
    (item) => item.jsonrpc === "2.0" && item.id === "run-invalid" && item.error,
    "JSON-RPC invalid params response",
  );
  assert.equal(invalidParams.error.code, -32602);
  assert.ok(Array.isArray(invalidParams.error.data));
  assert.equal(validators.validateJsonRpcResponse(invalidParams).valid, true);

  rpc.send(fixture("invalid", "unknown-method"));
  const unknownMethod = await rpc.waitFor(
    (item) => item.jsonrpc === "2.0" && item.id === "unknown-1" && item.error,
    "JSON-RPC method not found response",
  );
  assert.equal(unknownMethod.error.code, -32601);
  assert.equal(validators.validateJsonRpcResponse(unknownMethod).valid, true);

  rpc.send({
    jsonrpc: "2.0",
    method: "unknown/notification",
  });

  rpc.send(fixture("valid", "ping-request"));
  const ping = await rpc.waitFor(
    (item) => item.jsonrpc === "2.0" && item.id === "ping-1" && item.result,
    "JSON-RPC ping response",
  );
  assert.deepEqual(ping, {
    jsonrpc: "2.0",
    id: "ping-1",
    result: { type: "pong" },
  });
  assert.equal(validators.validateJsonRpcResponse(ping).valid, true);
  assert.equal(
    rpc.seen.some((item) => item.id === null && item.error?.message === "Method not found: unknown/notification"),
    false,
    "JSON-RPC notification 即使无效也不能收到 response",
  );

  rpc.send({
    jsonrpc: "2.0",
    id: "tools-1",
    method: "agent/tools/list",
    params: {},
  });
  const tools = await rpc.waitFor(
    (item) => item.id === "tools-1" && item.result?.type === "agent_tools",
    "JSON-RPC agent tools response",
  );
  assert.ok(Array.isArray(tools.result.tools));
  assert.equal(validators.validateJsonRpcResponse(tools).valid, true);
  const permissionDefinitions = protocolSdk.agentPermissionOptions;
  assert.deepEqual(tools.result.permissionOptions, permissionDefinitions);
  assert.equal(tools.result.permissionOptions.filter((option) => option.isDefault).length, 1);
  assert.ok(tools.result.permissionOptions.every((option) => !Object.hasOwn(option, "policy")));

  rpc.send({
    jsonrpc: "2.0",
    id: "chat-1",
    method: "agent/chat",
    params: {
      streamId: "chat-stream-1",
      stream: true,
      systemPrompt: "Answer briefly.",
      messages: [{ role: "user", content: "Hello protocol." }],
    },
  });
  const chatEvent = await rpc.waitFor(
    (item) =>
      item.method === "runtime/event" && item.params?.taskId === "chat-stream-1" && item.params?.type === "text_delta",
    "JSON-RPC chat event",
  );
  assert.equal(validators.validateJsonRpcNotification(chatEvent).valid, true);
  const chatResult = await rpc.waitFor(
    (item) => item.id === "chat-1" && item.result?.type === "chat_result",
    "JSON-RPC chat response",
  );
  assert.equal(typeof chatResult.result.text, "string");
  assert.equal(validators.validateJsonRpcResponse(chatResult).valid, true);

  rpc.send({
    jsonrpc: "2.0",
    id: "answer-1",
    method: "agent/question/answer",
    params: {
      taskId: "missing-task",
      questionId: "missing-question",
      answer: "ignored",
    },
  });
  const answerAck = await rpc.waitFor(
    (item) => item.id === "answer-1" && item.result?.type === "ack",
    "JSON-RPC answer acknowledgement",
  );
  assert.equal(validators.validateJsonRpcResponse(answerAck).valid, true);

  const runRequest = fixture("valid", "run-agent-request");
  runRequest.params.workspacePath = workspacePath;
  runRequest.params.sessionRootDir = join(workspacePath, "session");
  runRequest.params.agentRoleId = "writer";
  rpc.send(runRequest);

  const started = await rpc.waitFor(
    (item) =>
      item.jsonrpc === "2.0" &&
      item.method === "runtime/event" &&
      item.params?.type === "started" &&
      item.params?.taskId === "task-1",
    "JSON-RPC runtime event notification",
  );
  assert.ok(!("id" in started), "runtime/event 必须是 notification");
  assert.equal(validators.validateJsonRpcNotification(started).valid, true);
  assert.equal(validators.validateRuntimeEvent(started.params).valid, true);

  rpc.send({
    jsonrpc: "2.0",
    id: "heartbeat-during-run",
    method: "runtime/ping",
    params: {},
  });
  const heartbeatDuringRun = await rpc.waitFor(
    (item) => item.id === "heartbeat-during-run" && item.result?.type === "pong",
    "JSON-RPC heartbeat while agent is running",
  );
  assert.equal(validators.validateJsonRpcResponse(heartbeatDuringRun).valid, true);

  const runResult = await rpc.waitFor(
    (item) => item.jsonrpc === "2.0" && item.id === "run-1" && item.result?.type === "task_result",
    "JSON-RPC agent result",
  );
  assert.equal(runResult.result.taskId, "task-1");
  assert.equal(runResult.result.success, true);
  assert.ok(!("requestId" in runResult.result), "响应不能泄露内部 requestId");
  assert.equal(validators.validateJsonRpcResponse(runResult).valid, true);
  assert.equal(validators.validateRuntimeResult(runResult.result).valid, true);

  rpc.send({
    jsonrpc: "2.0",
    id: "session-read-1",
    method: "session/read",
    params: {
      workspacePath,
      sessionRootDir: runRequest.params.sessionRootDir,
    },
  });
  const sessionResult = await rpc.waitFor(
    (item) => item.id === "session-read-1" && item.result?.type === "session_result",
    "JSON-RPC session response",
  );
  assert.equal(validators.validateJsonRpcResponse(sessionResult).valid, true);

  rpc.send({
    jsonrpc: "2.0",
    id: "collaboration-1",
    method: "collaboration/run",
    params: {
      workspacePath,
      sessionRootDir: join(workspacePath, "collaboration-session"),
      workflow: {
        id: "protocol-collaboration",
        steps: [
          {
            id: "writer",
            type: "agent",
            agentRoleId: "writer",
            userMessage: "Return a protocol smoke-test response.",
          },
        ],
      },
      agents: [{ id: "writer", label: "Writer" }],
    },
  });
  const collaborationResult = await rpc.waitFor(
    (item) => item.id === "collaboration-1" && item.result?.type === "collaboration_result",
    "JSON-RPC collaboration response",
  );
  assert.equal(validators.validateJsonRpcResponse(collaborationResult).valid, true);
  const additionalResult = await rpc.waitFor(
    (item) =>
      item.method === "runtime/result" &&
      item.params?.rpcRequestId === "collaboration-1" &&
      item.params?.type === "task_result",
    "JSON-RPC additional collaboration result",
  );
  assert.equal(additionalResult.params.taskId, "collaboration-1");
  assert.equal(validators.validateJsonRpcNotification(additionalResult).valid, true);
  assert.equal(validators.validateRuntimeResult(additionalResult.params).valid, true);

  rpc.send({ type: "ping", requestId: "legacy-rejected" });
  const legacyProtocolError = await rpc.waitFor(
    (item) => item.jsonrpc === "2.0" && item.error?.code === -32600,
    "legacy protocol rejection",
  );
  assert.equal(legacyProtocolError.id, null);

  rpc.send({
    jsonrpc: "2.0",
    id: "shutdown-1",
    method: "runtime/shutdown",
    params: {},
  });
  const shutdown = await rpc.waitFor(
    (item) => item.id === "shutdown-1" && item.result?.type === "shutdown_ack",
    "JSON-RPC shutdown response",
  );
  assert.equal(validators.validateJsonRpcResponse(shutdown).valid, true);

  console.log("agent runtime protocol stdio e2e passed");
} finally {
  await rpc.close();
  rmSync(workspacePath, { recursive: true, force: true });
}
