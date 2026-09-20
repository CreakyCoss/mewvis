import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const bundle = await build({
  entryPoints: [
    fileURLToPath(new URL("../main/platform/agent.ts", import.meta.url)),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { createApplicationAgentRuntime } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
function fixture() {
  const sessions = new Map(),
    summaries = [],
    contexts = [],
    configurations = [],
    deleted = [];
  const client = {
    listSessions: async () => summaries,
    openSession: async ({ chatId }) => sessions.get(chatId),
    createSession: async (input) => {
      const id = String(sessions.size + 1);
      summaries.push({ chatId: id, sceneId: input.sceneId });
      const snapshot = {
        phase: "idle",
        messages: [],
        error: "",
        initializationError: "",
      };
      const session = {
        identity: { id },
        getSnapshot: () => snapshot,
        subscribe: () => () => {},
        setContext: async (context) => {
          contexts.push({ id, context });
          return { ok: true };
        },
        updateConfig: async (config) => {
          configurations.push(config);
          return { ok: true };
        },
        flush: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        send: async ({ text }) => {
          snapshot.messages.push(
            { role: "user", blocks: [{ type: "text", content: text }] },
            {
              role: "assistant",
              blocks: [{ type: "text", content: "角色回复" }],
            },
          );
          return { status: "dispatched", taskId: "task" };
        },
      };
      sessions.set(id, session);
      return session;
    },
    deleteSession: async ({ chatId }) => {
      deleted.push(chatId);
    },
  };
  const runtime = createApplicationAgentRuntime(client, async (path) => ({
    workspace: { id: "workspace" },
    relativePath: path,
  }));
  return { runtime, summaries, contexts, configurations, deleted };
}
test("tavern resumes each role separately, updates context every turn and resets only the current chapter", async () => {
  const f = fixture();
  const base = {
    workspacePath: "chapter-1",
    agentRoleId: "director",
    userMessage: "第一轮",
    systemPrompt: "导演",
    runtimeModel: { modelId: "model-1" },
  };
  assert.equal(
    (await f.runtime.run({ ...base, requestContext: "上下文一" })).text,
    "角色回复",
  );
  await f.runtime.run({ ...base, requestContext: "上下文二" });
  await f.runtime.run({
    ...base,
    agentRoleId: "character-a",
    requestContext: "A 可见",
  });
  await f.runtime.run({ ...base, workspacePath: "chapter-2" });
  assert.equal(f.summaries.length, 3);
  assert.equal(f.contexts[0].id, f.contexts[1].id);
  assert.equal(f.contexts[1].context.requestContext, "上下文二");
  assert.notEqual(f.contexts[1].id, f.contexts[2].id);
  assert.equal(f.configurations[0].selectedModelId, "model-1");
  await f.runtime.deleteSessions("chapter-1");
  assert.deepEqual(f.deleted, ["1", "2"]);
});
test("tavern rejects concurrent role runs and cancels failed or interactive turns without leaving observers", async () => {
  for (const failure of [{ error: "模型失败" }, { pendingQuestion: { id: "question" } }]) {
    let signal;
    const gate = new Promise(resolve => { signal = resolve; });
    let stops = 0, observers = 0;
    const snapshot = { phase: "running", messages: [], error: "", initializationError: "" };
    const session = {
      identity: { id: "test-role" }, getSnapshot: () => snapshot,
      flush: async () => ({ ok: true }), setContext: async () => ({ ok: true }),
      stop: async () => { stops++; return { ok: true }; },
      subscribe: () => { observers++; return () => { observers--; }; },
      send: async () => { await gate; Object.assign(snapshot, failure); return { status: "dispatched" }; },
    };
    const runtime = createApplicationAgentRuntime({ listSessions: async () => [], createSession: async () => session }, async path => ({ workspace: { id: "workspace" }, relativePath: path }));
    const input = { workspacePath: "chapter", agentRoleId: "director", userMessage: "继续" };
    const pending = runtime.run(input);
    await assert.rejects(runtime.run(input), /正在运行/);
    await assert.rejects(runtime.deleteSessions("chapter"), /等待/);
    signal();
    await assert.rejects(pending, failure.error ? /模型失败/ : /额外用户输入/);
    assert.equal(stops, 1);
    assert.equal(observers, 0);
  }
});
