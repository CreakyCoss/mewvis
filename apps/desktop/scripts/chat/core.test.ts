import { agentPermissionOptions } from "../../src/agent-client/wire";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createChatSession,
  createChatService,
  type ChatRuntime,
  type ChatStorage,
  type ChatResources,
} from "../../src/chat/core";
import { AgentRuntimeEventType as E } from "../../src/agent-client/wire";
import type { AgentClientAgentEvent } from "../../src/agent-client/contracts";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const resources: ChatResources = {
  permissionOptions: structuredClone([...agentPermissionOptions]),
  models: [{ value: "model", label: "Model", selectedLabel: "Model", description: "", isDefault: true }],
  tools: [{ value: "read", label: "Read", description: "", isDefault: true }],
  skillGroups: [
    {
      value: "g",
      label: "Group",
      description: "",
      isDefault: true,
      skills: [{ key: "s", name: "skill", label: "Skill", description: "" }],
    },
  ],
  knowledgeCollections: [{ value: "k", label: "Knowledge", description: "", isDefault: true }],
};
async function setup(
  overrides: {
    runtime?: Partial<ChatRuntime>;
    storage?: Partial<ChatStorage>;
    catalog?: () => Promise<ChatResources>;
  } = {},
) {
  let listener: ((event: AgentClientAgentEvent) => void) | undefined;
  const calls = {
    subscribed: 0,
    detached: 0,
    dispatched: 0,
    aborted: [] as string[],
    saved: [] as any[],
    released: 0,
    answers: 0,
  };
  const runtime: ChatRuntime = {
    async subscribe(next) {
      calls.subscribed++;
      listener = next;
      return () => {
        calls.detached++;
        listener = undefined;
      };
    },
    async prepare() {
      return {
        async dispatch() {
          calls.dispatched++;
        },
      };
    },
    async abort(id) {
      calls.aborted.push(id);
    },
    async answer() {
      calls.answers++;
    },
    async release() {
      calls.released++;
    },
    ...overrides.runtime,
  };
  const session = await createChatSession({
    identity: { scope: "test", id: "one" },
    runtime,
    storage: {
      async load() {
        return null;
      },
      async save(record) {
        calls.saved.push(record);
      },
      ...overrides.storage,
    },
    catalog: { load: overrides.catalog ?? (async () => structuredClone(resources)) },
    saveDelays: { node: 5, stream: 10 },
  });
  const emit = (event: any, taskId = session.getSnapshot().activeTaskId!) => listener?.({ taskId, event });
  return { session, calls, emit };
}
test("node core imports without DOM, hydrates config and protects read failures", async () => {
  assert.equal(typeof document, "undefined");
  let fail = true;
  const { session, calls } = await setup({
    storage: {
      async load() {
        if (fail) throw new Error("broken history");
        return {
          title: "Old",
          messages: [],
          config: { permissionMode: "ask", selectedSkillKeys: [], selectedKnowledgeCollectionIds: [] },
        };
      },
    },
  });
  assert.equal((await session.send({ text: "no" })).status, "rejected");
  await session.flush();
  assert.equal(calls.saved.length, 0);
  fail = false;
  await session.retryInitialization();
  assert.equal(calls.subscribed, 1);
  assert.deepEqual(session.getSnapshot().config.permissionMode, "ask");
  assert.deepEqual(session.getSnapshot().config.selectedSkillKeys, []);
  await session.close();
});
test("stream, thinking, replacement, tool events, task identity and terminal flush", async () => {
  const { session, emit } = await setup();
  const result = await session.send({ text: "hello" });
  emit({ type: E.TextDelta, delta: "wrong" }, "old-task");
  emit({ type: E.ThinkingDelta, delta: "reason" });
  emit({ type: E.ThinkingEnd, content: "reasoned" });
  emit({ type: E.ToolCallStart, toolCallId: "tool", toolName: "read" });
  emit({ type: E.ToolCallDelta, toolCallId: "tool", toolName: "read", delta: "{}" });
  emit({ type: E.ToolExecutionEnd, toolCallId: "tool", toolName: "read", result: "ok", isError: false });
  emit({ type: E.TextDelta, delta: "old" });
  emit({ type: E.ReplaceText, text: "answer" });
  emit({ type: E.Done, text: "answer" });
  emit({ type: E.TextDelta, delta: "late" }, result.taskId);
  const message = session.getSnapshot().messages[1];
  assert.equal(message.status, "done");
  assert.equal(message.blocks.at(-1)?.content, "answer");
  assert.equal(message.blocks[0].content, "reasoned");
  assert.equal(message.blocks[1].status, "done");
  await session.close();
});
test("stop resolves pending preparation immediately; late work and errors cannot affect next turn", async () => {
  const gate = deferred<any>();
  let first = true;
  const { session, calls } = await setup({
    runtime: { prepare: async () => (first ? ((first = false), gate.promise) : { dispatch: async () => {} }) },
  });
  const pending = session.send({ text: "first" });
  await tick();
  await session.stop();
  assert.equal((await pending).status, "cancelled");
  await session.send({ text: "second" });
  const task = session.getSnapshot().activeTaskId;
  gate.resolve({
    dispatch: async () => {
      calls.dispatched++;
    },
  });
  await tick();
  assert.equal(calls.dispatched, 0);
  assert.equal(session.getSnapshot().activeTaskId, task);
  await session.close();
});
test("stop during dispatch waits for registration, aborts once, and failed abort retries", async () => {
  const gate = deferred();
  let aborted = 0;
  const { session } = await setup({
    runtime: {
      async prepare() {
        return { dispatch: () => gate.promise };
      },
      async abort() {
        aborted++;
        if (aborted === 1) throw new Error("abort failed");
      },
    },
  });
  const pending = session.send({ text: "run" });
  await tick();
  const stopping = session.stop();
  const duplicate = session.stop();
  assert.equal(stopping, duplicate);
  assert.equal((await pending).status, "cancelled");
  assert.equal(aborted, 0);
  gate.resolve();
  assert.equal((await stopping).ok, false);
  assert.equal((await session.send({ text: "blocked" })).status, "rejected");
  assert.equal((await session.stop()).ok, true);
  assert.equal(aborted, 2);
  await session.close();
});
test("answers are correlated, duplicates rejected and failures remain retryable", async () => {
  const gate = deferred();
  const { session, emit } = await setup({ runtime: { answer: () => gate.promise } });
  await session.send({ text: "ask" });
  emit({ type: E.Question, questionId: "q1", question: "Question?", expiresAt: Date.now() + 3 * 60_000 });
  const pending = session.answer({ questionId: "q1", answer: "yes" });
  assert.equal((await session.answer({ questionId: "q1", answer: "yes" })).ok, false);
  emit({ type: E.Question, questionId: "q2", question: "New?", expiresAt: Date.now() + 3 * 60_000 });
  gate.reject(new Error("old failure"));
  await pending;
  assert.equal(session.getSnapshot().pendingQuestion?.questionId, "q2");
  assert.equal(session.getSnapshot().error, "");
  await session.close();
});
test("cancelling a question is retryable and resumes the task without aborting it", async () => {
  const answers: (string | null)[] = [];
  let fail = true;
  const { session, emit, calls } = await setup({
    runtime: {
      async answer(_taskId, _questionId, answer) {
        if (fail) throw new Error("connection lost");
        answers.push(answer);
      },
    },
  });
  await session.send({ text: "ask" });
  const taskId = session.getSnapshot().activeTaskId;
  emit({ type: E.Question, questionId: "q", question: "Question?", expiresAt: Date.now() + 3 * 60_000 });
  assert.equal((await session.answer({ questionId: "stale", answer: null })).ok, false);
  assert.equal((await session.answer({ questionId: "q", answer: "  " })).ok, false);
  assert.equal((await session.answer({ questionId: "q", answer: null })).ok, false);
  assert.equal(session.getSnapshot().pendingQuestion?.questionId, "q");
  assert.equal(session.getSnapshot().answering, false);
  fail = false;
  assert.equal((await session.answer({ questionId: "q", answer: null })).ok, true);
  assert.deepEqual(answers, [null]);
  assert.equal(session.getSnapshot().pendingQuestion, null);
  assert.equal(session.getSnapshot().activeTaskId, taskId);
  assert.equal(session.getSnapshot().phase, "running");
  assert.deepEqual(calls.aborted, []);
  await session.close();
});
test("question deadlines are preserved and expired replies cannot reach the runtime", async () => {
  const { session, emit, calls } = await setup();
  await session.send({ text: "ask" });
  const expiresAt = Date.now() - 1;
  emit({ type: E.Question, questionId: "q", question: "Question?", expiresAt });
  assert.equal(session.getSnapshot().pendingQuestion?.expiresAt, expiresAt);
  assert.equal((await session.answer({ questionId: "q", answer: "late answer" })).ok, false);
  assert.equal(calls.answers, 0);
  emit({ type: E.QuestionAnswered, questionId: "q", answer: null });
  assert.equal(session.getSnapshot().pendingQuestion, null);
  assert.equal(session.getSnapshot().phase, "running");
  await session.close();
});
test("terminal events during abort do not unlock a new turn before the abort acknowledgement", async () => {
  const gate = deferred();
  const { session, emit } = await setup({ runtime: { abort: () => gate.promise } });
  await session.send({ text: "first" });
  const stopping = session.stop();
  emit({ type: E.Done, text: "completed while stopping" });
  assert.equal(session.getSnapshot().phase, "stopping");
  assert.equal((await session.send({ text: "too early" })).status, "rejected");
  gate.resolve();
  await stopping;
  assert.equal((await session.send({ text: "next" })).status, "dispatched");
  await session.close();
});
test("saving is serialized, failure is visible and latest state can retry", async () => {
  const gate = deferred();
  let attempts = 0;
  let running = 0;
  let max = 0;
  const writes: any[] = [];
  const { session } = await setup({
    storage: {
      async save(record) {
        attempts++;
        running++;
        max = Math.max(max, running);
        try {
          if (attempts === 1) {
            await gate.promise;
            throw new Error("disk full");
          }
          writes.push(record);
        } finally {
          running--;
        }
      },
    },
  });
  session.updateConfig({ permissionMode: "ask" });
  await tick();
  session.updateConfig({ selectedSkillKeys: [] });
  gate.resolve();
  await session.flush();
  assert.equal(max, 1);
  assert.equal(session.getSnapshot().saveError, "");
  assert.deepEqual(writes.at(-1).config.permissionMode, "ask");
  assert.deepEqual(writes.at(-1).config.selectedSkillKeys, []);
  await session.close();
});
test("temporary catalog failure preserves selections and explicit empty values", async () => {
  let fail = false;
  const { session } = await setup({
    catalog: async () =>
      fail
        ? {
            models: resources.models,
            tools: [],
            skillGroups: [],
            knowledgeCollections: [],
            errors: { tools: "offline" },
          }
        : structuredClone(resources),
  });
  session.updateConfig({
    permissionMode: "auto",
    selectedSkillKeys: ["s"],
    selectedKnowledgeCollectionIds: ["k"],
  });
  fail = true;
  await session.refreshResources();
  assert.deepEqual(session.getSnapshot().config.permissionMode, "auto");
  fail = false;
  await session.refreshResources();
  assert.deepEqual(session.getSnapshot().config.selectedSkillKeys, ["s"]);
  assert.deepEqual(session.getSnapshot().config.selectedKnowledgeCollectionIds, ["k"]);
  await session.close();
});
test("multiple observers do not own lifecycle; close saves and detaches once", async () => {
  const { session, calls, emit } = await setup();
  const a = session.subscribe(() => {});
  const b = session.subscribe(() => {});
  await session.send({ text: "background" });
  a();
  b();
  emit({ type: E.TextDelta, delta: "still running" });
  emit({ type: E.Done, text: "still running" });
  await session.flush();
  assert.equal(session.getSnapshot().messages[1].blocks[0].content, "still running");
  await session.close();
  await session.close();
  assert.equal(calls.subscribed, 1);
  assert.equal(calls.detached, 1);
  assert.equal(calls.released, 1);
});
test("manager coalesces concurrent opens and separates scopes; request IDs deduplicate", async () => {
  let created = 0;
  const service = createChatService(async () => {
    created++;
    return (await setup()).session;
  });
  const one = { identity: { scope: "a", id: "same" } };
  const first = service.openSession(one);
  assert.equal(first, service.openSession(one));
  const session = await first;
  await service.openSession({ identity: { scope: "b", id: "same" } });
  assert.equal(created, 2);
  const sent = session.send({ text: "once", requestId: "once" });
  assert.equal(sent, session.send({ text: "once", requestId: "once" }));
  await sent;
  assert.equal(session.getSnapshot().messages.length, 2);
  await service.closeSession(one.identity);
  await service.closeSession({ scope: "b", id: "same" });
});
test("close failure retains the session for a successful retry", async () => {
  let failing = false;
  const { session, calls, emit } = await setup({
    storage: {
      async save() {
        if (failing) throw new Error("disk full");
      },
    },
  });
  await session.send({ text: "keep" });
  failing = true;
  emit({ type: E.Done, text: "answer" });
  assert.equal((await session.close()).ok, false);
  assert.equal(calls.detached, 0);
  assert.equal(calls.released, 0);
  assert.equal(session.getSnapshot().dirty, true);
  failing = false;
  assert.equal((await session.close()).ok, true);
  assert.equal(calls.detached, 1);
  assert.equal(session.getSnapshot().saveError, "");
});
test("dispatch waits for initial persistence and cancellation wins a pending save", async () => {
  const gate = deferred();
  const { session, calls } = await setup({
    storage: {
      async save() {
        await gate.promise;
      },
    },
  });
  const pending = session.send({ text: "first" });
  await tick();
  assert.equal(calls.dispatched, 0);
  await session.stop();
  assert.equal((await pending).status, "cancelled");
  gate.resolve();
  await session.flush();
  await tick();
  assert.equal(calls.dispatched, 0);
  await session.close();
  const failed = await setup({
    storage: {
      async save() {
        throw new Error("disk full");
      },
    },
  });
  assert.equal((await failed.session.send({ text: "keep draft" })).status, "rejected");
  assert.equal(failed.calls.dispatched, 0);
  assert.match(failed.session.getSnapshot().saveError, /disk full/);
});
test("one event transport shared by two sessions keeps task state isolated", async () => {
  const listeners = new Set<(event: AgentClientAgentEvent) => void>();
  const runtime: ChatRuntime = {
    async subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async prepare() {
      return { async dispatch() {} };
    },
    async abort() {},
    async answer() {},
    async release() {},
  };
  const open = (scope: string) =>
    createChatSession({
      identity: { scope, id: "same" },
      runtime,
      storage: {
        async load() {
          return null;
        },
        async save() {},
      },
      catalog: {
        async load() {
          return structuredClone(resources);
        },
      },
    });
  const a = await open("a");
  const b = await open("b");
  const first = await a.send({ text: "A" });
  await b.send({ text: "B" });
  for (const listener of listeners)
    listener({ taskId: first.taskId!, event: { type: E.Done, taskId: first.taskId!, text: "A only" } });
  assert.equal(a.getSnapshot().activeTaskId, null);
  assert.notEqual(b.getSnapshot().activeTaskId, null);
  assert.equal(b.getSnapshot().messages[1].blocks.length, 0);
  await a.close();
  await b.close();
  assert.equal(listeners.size, 0);
});
test("long streams save before terminal completion", async () => {
  const { session, emit, calls } = await setup();
  await session.send({ text: "stream" });
  emit({ type: E.TextDelta, delta: "partial" });
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert(calls.saved.some((record) => record.messages[1]?.blocks.some((block: any) => block.content === "partial")));
  assert.notEqual(session.getSnapshot().activeTaskId, null);
  await session.close();
});
test("opening during explicit close waits for resource release and creates a fresh owner", async () => {
  const gate = deferred();
  let created = 0;
  const service = createChatService(async () => {
    const first = ++created === 1;
    return (
      await setup({
        runtime: {
          async release() {
            if (first) await gate.promise;
          },
        },
      })
    ).session;
  });
  const input = { identity: { scope: "owner", id: "one" } };
  const first = await service.openSession(input);
  const closing = service.closeSession(input.identity);
  assert.equal(closing, service.closeSession(input.identity));
  const reopening = service.openSession(input);
  await tick();
  assert.equal(created, 1);
  gate.resolve();
  assert.equal((await closing).ok, true);
  const second = await reopening;
  assert.notEqual(first, second);
  assert.equal(created, 2);
  assert.equal(service.getSession(input.identity), second);
  await service.closeSession(input.identity);
});

test("authorization belongs to the core turn: no record changes before approval, immediate stop and stale result isolation", async () => {
  const authorization = deferred();
  let authorize = () => authorization.promise;
  const { session, calls } = await setup({ runtime: { authorize: () => authorize() } });
  const sending = session.send({ text: "await permission" });
  assert.equal(session.getSnapshot().phase, "preparing");
  assert.equal(session.getSnapshot().messages.length, 0);
  assert.equal(calls.saved.length, 0);
  assert.equal((await session.updateConfig({ permissionMode: "ask" })).ok, false);
  assert.equal((await session.stop()).ok, true);
  assert.equal((await sending).status, "cancelled");
  assert.equal(session.getSnapshot().phase, "idle");
  assert.equal(calls.saved.length, 0);
  authorize = () => Promise.resolve();
  assert.equal((await session.send({ text: "next authorized turn" })).status, "dispatched");
  const currentTask = session.getSnapshot().activeTaskId;
  authorization.reject(new Error("late denial"));
  await tick();
  assert.equal(session.getSnapshot().activeTaskId, currentTask);
  assert.equal(session.getSnapshot().phase, "running");
  assert.equal(calls.dispatched, 1);
  assert.doesNotMatch(JSON.stringify(session.getSnapshot().messages), /await permission|late denial/);
  await session.stop();
  const messages = session.getSnapshot().messages;
  const saves = calls.saved.length;
  authorize = () => Promise.reject(new Error("permission denied"));
  assert.equal((await session.send({ text: "denied" })).status, "rejected");
  assert.deepEqual(session.getSnapshot().messages, messages);
  assert.equal(calls.saved.length, saves);
  await session.close();
});

test("legacy tool selection migrates to ask and restored modes are independent of the tool catalog", async () => {
  const legacy = await setup({
    storage: {
      async load() {
        return { title: "legacy", messages: [], config: { selectedToolNames: ["bash"] } as any };
      },
    },
  });
  assert.equal(legacy.session.getSnapshot().config.permissionMode, "ask");
  await legacy.session.close();
  const plugin = await setup({
    catalog: async () => ({ ...resources, tools: [] }),
    storage: {
      async load() {
        return { title: "plugin", messages: [], config: { permissionMode: "full" } };
      },
    },
  });
  assert.equal(plugin.session.getSnapshot().config.permissionMode, "full");
  assert.equal((await plugin.session.updateConfig({ permissionMode: "full" })).ok, true);
  assert.equal((await plugin.session.updateConfig({ permissionMode: "auto" })).ok, true);
  await plugin.session.close();
});

test("approval events wait independently of questions, reject question answers and clear on stop", async () => {
  const { session, emit, calls } = await setup();
  await session.send({ text: "work" });
  const taskId = session.getSnapshot().activeTaskId!;
  emit({
    type: E.ApprovalRequested,
    taskId,
    approvalId: "approval",
    executionId: "call",
    summary: "bash",
    details: "{}",
    reason: "shell",
    expiresAt: Date.now() + 60_000,
  });
  assert.equal(session.getSnapshot().phase, "waiting");
  assert.equal((await session.answer({ questionId: "approval", answer: "yes" })).ok, false);
  assert.equal(calls.answers, 0);
  emit({ type: E.Question, questionId: "question", question: "detail?", expiresAt: Date.now() + 3 * 60_000 });
  emit({ type: E.QuestionAnswered, questionId: "question", answer: "detail" });
  assert.equal(session.getSnapshot().pendingApproval?.approvalId, "approval");
  assert.equal(session.getSnapshot().phase, "waiting");
  emit({ type: E.ApprovalResolved, taskId, approvalId: "wrong", approved: true });
  assert.equal(session.getSnapshot().pendingApproval?.approvalId, "approval");
  await session.stop();
  assert.equal(session.getSnapshot().pendingApproval, null);
  await session.close();
});

test("permission selection, restoration and refresh follow the returned catalog", async () => {
  let permissionOptions = agentPermissionOptions
    .filter((option) => option.mode !== "full")
    .map((option) => ({ ...option, label: `来自后端：${option.label}`, isDefault: option.mode === "auto" }));
  const { session, calls } = await setup({
    catalog: async () => ({ ...resources, permissionOptions }),
    storage: { load: async () => ({ title: "saved", messages: [], config: { permissionMode: "full" } }) },
  });
  assert.equal(session.getSnapshot().config.permissionMode, "auto", "removed saved modes use the server default");
  assert.match(session.getSnapshot().resources.permissionOptions![0].label, /来自后端/);
  assert.equal((await session.updateConfig({ permissionMode: "full" })).ok, false);
  assert.equal((await session.updateConfig({ permissionMode: "ask" })).ok, true);
  permissionOptions = [];
  await session.refreshResources();
  assert.equal(session.getSnapshot().config.permissionMode, "ask", "a failed catalog refresh preserves the selection");
  assert.equal((await session.send({ text: "must not guess permissions" })).status, "rejected");
  assert.equal(calls.dispatched, 0);
  permissionOptions = agentPermissionOptions
    .filter((option) => option.mode === "auto")
    .map((option) => ({ ...option, label: "新的默认权限", isDefault: true }));
  await session.refreshResources();
  assert.equal(session.getSnapshot().config.permissionMode, "auto");
  assert.equal((await session.updateConfig({ permissionMode: "ask" })).ok, false);
  await session.close();
});

test("thinking selections use frontend defaults and preserve custom values through restoration", async () => {
  const models: ChatResources["models"] = [
    {
      value: "a",
      label: "A",
      selectedLabel: "A",
      thinking: {
        levels: [
          { value: "high", label: "高" },
          { value: "max", label: "最高" },
        ],
        defaultLevel: "high",
      },
    },
    {
      value: "b",
      label: "B",
      selectedLabel: "B",
      thinking: {
        levels: [
          { value: "off", label: "关闭" },
          { value: "low", label: "低" },
        ],
        defaultLevel: "low",
      },
    },
    { value: "c", label: "C", selectedLabel: "C" },
  ];
  let offline = false;
  const catalog = async (): Promise<ChatResources> =>
    offline ? { ...resources, models: [], errors: { models: "offline" } } : { ...resources, models };
  const { session, calls } = await setup({ catalog });
  assert.equal(session.getSnapshot().config.thinkingLevel, "high");
  assert.equal((await session.updateConfig({ thinkingLevel: "max" })).ok, true);
  await session.flush();
  const restored = await setup({ catalog, storage: { load: async () => calls.saved.at(-1) } });
  assert.equal(restored.session.getSnapshot().config.thinkingLevel, "max");
  await restored.session.close();
  offline = true;
  await session.refreshResources();
  assert.equal(session.getSnapshot().config.thinkingLevel, "max");
  offline = false;
  await session.refreshResources();
  assert.equal(session.getSnapshot().config.thinkingLevel, "max");
  assert.equal((await session.updateConfig({ selectedModelId: "b", thinkingLevel: "provider-custom" })).ok, true);
  assert.equal(session.getSnapshot().config.thinkingLevel, "provider-custom");
  await session.updateConfig({ selectedModelId: "a" });
  await session.updateConfig({ selectedModelId: "b" });
  assert.equal(session.getSnapshot().config.thinkingLevel, "low");
  await session.updateConfig({ thinkingLevel: "off" });
  assert.equal(session.getSnapshot().config.thinkingLevel, "off");
  await session.updateConfig({ selectedModelId: "c" });
  assert.equal(session.getSnapshot().config.thinkingLevel, null);
  assert.equal((await session.updateConfig({ thinkingLevel: "provider-custom" })).ok, true);
  await session.updateConfig({ thinkingLevel: null });
  assert.equal(session.getSnapshot().config.thinkingLevel, null);
  await session.close();
  const obsolete = await setup({
    catalog,
    storage: {
      load: async () => ({
        title: "saved",
        messages: [],
        config: { selectedModelId: "b", thinkingLevel: "max" },
      }),
    },
  });
  assert.equal(obsolete.session.getSnapshot().config.thinkingLevel, "max");
  await obsolete.session.close();
});
