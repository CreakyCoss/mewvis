import entries from "../../../agent-runtime/build-entries.json" with { type: "json" };
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { runtimePayloadFromJsonRpcMessage, writeAgentRuntimeCommand } from "../../agent-runtime/stdio-json-rpc-client.mjs";
const bundle = await build({
  stdin: {
    contents:
      'export * from "./src/chat/core/index.ts"; export { agentPermissionOptions } from "./src/agent-client/wire.ts";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  write: false,
});
const { createChatSession, agentPermissionOptions } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const workspacePath = await mkdtemp(join(tmpdir(), "mewvis-chat-core-"));
const sessionRootDir = join(workspacePath, "runtime-session");
const history = join(workspacePath, "history.json");
const child = spawn(process.execPath, [`../agent-runtime/dist/${entries.cli.output}`], {
  env: { ...process.env, AGENT_RUNTIME_PROFILE_ID: "mock" },
  stdio: ["pipe", "pipe", "pipe"],
});
let listener;
let buffer = "";
let stderr = "";
const events = [];
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    const event = runtimePayloadFromJsonRpcMessage(JSON.parse(line));
    events.push(event);
    if (event.taskId) listener?.({ taskId: event.taskId, event });
  }
});
const runtime = {
  async subscribe(next) {
    listener = next;
    return () => {
      listener = undefined;
    };
  },
  async prepare(turn, signal) {
    return {
      async dispatch() {
        signal.throwIfAborted();
        writeAgentRuntimeCommand(child.stdin, {
          type: "run_agent",
          requestId: turn.taskId,
          taskId: turn.taskId,
          workspacePath,
          sessionRootDir,
          agentRoleId: "cli-chat",
          userMessage: turn.input.text,
          systemPrompt: "CLI integration fixture",
          resources: { tools: { allowed: [] }, skills: { enabled: [] } },
        });
      },
    };
  },
  async abort() {
    child.kill();
  },
  async answer(taskId, questionId, answer) {
    writeAgentRuntimeCommand(child.stdin, { type: "answer_question", taskId, questionId, answer });
  },
  async release() {},
};
const storage = {
  async load() {
    try {
      return JSON.parse(await readFile(history, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  },
  async save(record) {
    await writeFile(history, JSON.stringify(record));
  },
};
const catalog = {
  async load() {
    return {
      permissionOptions: structuredClone([...agentPermissionOptions]),
      models: [{ value: "fixture", label: "Fixture", selectedLabel: "Fixture", description: "", isDefault: true }],
    };
  },
};
const waitForIdle = (session) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      detach();
      reject(new Error(`Runtime timeout: ${stderr}`));
    }, 20_000);
    const detach = session.subscribe(() => {
      if (!session.getSnapshot().activeTaskId) {
        clearTimeout(timer);
        detach();
        resolve();
      }
    });
    if (!session.getSnapshot().activeTaskId) {
      clearTimeout(timer);
      detach();
      resolve();
    }
  });
try {
  const session = await createChatSession({ identity: { scope: "cli", id: "one" }, runtime, storage, catalog });
  assert.equal((await session.send({ text: "first request" })).status, "dispatched");
  await waitForIdle(session);
  await session.flush();
  assert.equal(session.getSnapshot().messages.at(-1).status, "done");
  assert(events.some((event) => event.type === "text_delta"));
  assert(events.some((event) => event.type === "thinking_delta"));
  assert(events.some((event) => event.type === "tool_execution_end"));
  const runtimeBefore = await readFile(join(sessionRootDir, "ledger.jsonl"), "utf8");
  await session.close();
  const restored = await createChatSession({ identity: { scope: "cli", id: "one" }, runtime, storage, catalog });
  assert.equal(restored.getSnapshot().messages.length, 2);
  assert.equal(
    await readFile(join(sessionRootDir, "ledger.jsonl"), "utf8"),
    runtimeBefore,
    "Application hydration must not rewrite runtime history",
  );
  await restored.send({ text: "second request" });
  await waitForIdle(restored);
  await restored.close();
  assert.equal((await storage.load()).messages.length, 4);
  assert((await stat(join(sessionRootDir, "ledger.jsonl"))).size > runtimeBefore.length);
  console.log(
    "Chat core stdio e2e passed: existing runtime, streamed text/thinking/tools, history reopen, two turns, no DOM/Tauri.",
  );
} finally {
  const exited = once(child, "exit");
  child.kill();
  await exited;
  await rm(workspacePath, { recursive: true, force: true });
}
