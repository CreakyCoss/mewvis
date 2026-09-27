import { visibleMessages, messageAvatarSource } from "../../src/chat/react/messages/presentation";
import { agentPermissionOptions } from "../../src/agent-client/wire";
import test from "node:test";
import { getChatActivity } from "../../src/workbench/shell/chat-activity";
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
  assert.equal(session.getSnapshot().execution?.state, "cancelling");
  assert.equal(session.getSnapshot().execution?.cancelError, "abort failed");
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
  const application = await setup({
    catalog: async () => ({ ...resources, tools: [] }),
    storage: {
      async load() {
        return { title: "application", messages: [], config: { permissionMode: "full" } };
      },
    },
  });
  assert.equal(application.session.getSnapshot().config.permissionMode, "full");
  assert.equal((await application.session.updateConfig({ permissionMode: "full" })).ok, true);
  assert.equal((await application.session.updateConfig({ permissionMode: "auto" })).ok, true);
  await application.session.close();
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

test("sidebar activity follows approval and question events through resume and settlement", async () => {
  const { session, emit } = await setup();
  const activity = () => getChatActivity(session.getSnapshot());
  assert.equal(activity(), null);
  await session.send({ text: "work" });
  assert.equal(activity(), "running");
  const taskId = session.getSnapshot().activeTaskId!;
  emit({ type: E.Question, questionId: "q", question: "Detail?", expiresAt: Date.now() + 60_000 });
  assert.equal(activity(), "waiting-answer");
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
  assert.equal(activity(), "waiting-approval");
  emit({ type: E.ApprovalResolved, taskId, approvalId: "approval", approved: true });
  assert.equal(activity(), "waiting-answer");
  assert.equal((await session.answer({ questionId: "q", answer: "detail" })).ok, true);
  assert.equal(activity(), "running");
  emit({ type: E.Done, taskId, text: "Done" });
  assert.equal(activity(), null);
  await session.close();
});

test("shared execution snapshot drives sidebar pause and cancellation, retaining the turn until host acknowledgement", async () => {
  const resume = deferred();
  const abort = deferred();
  let resumes = 0;
  const { session, emit } = await setup({
    runtime: {
      resume: () => {
        resumes++;
        return resume.promise;
      },
      abort: () => abort.promise,
    },
  });
  const { taskId } = await session.send({ text: "two steps" });
  const state = (taskState: string, id = taskId) => emit({ type: "state", taskState, workerState: "running" }, id);
  state("pausing");
  assert.equal(session.getSnapshot().phase, "pausing");
  assert.equal(getChatActivity(session.getSnapshot()), "pausing");
  state("paused");
  assert.equal(session.getSnapshot().execution?.state, "paused");
  assert.equal(getChatActivity(session.getSnapshot()), "paused");
  assert.equal((await session.send({ text: "must not submit draft" })).status, "rejected");
  state("running", "another-task");
  assert.equal(session.getSnapshot().execution?.state, "paused");
  const first = session.resume!();
  assert.equal(session.resume!(), first);
  assert.equal(resumes, 1);
  assert.equal(session.getSnapshot().phase, "paused", "only a host event releases pause");
  state("running");
  resume.resolve();
  assert.equal((await first).ok, true);
  state("paused");
  const stopping = session.stop();
  assert.equal(session.getSnapshot().execution?.state, "cancelling");
  assert.equal(getChatActivity(session.getSnapshot()), "cancelling");
  state("running");
  state("cancelled");
  assert.equal(session.getSnapshot().phase, "stopping");
  assert.equal((await session.send({ text: "too early" })).status, "rejected");
  abort.resolve();
  await stopping;
  assert.equal(session.getSnapshot().activeTaskId, null);
  assert.equal(session.getSnapshot().execution?.state, "cancelled");
  assert.equal(getChatActivity(session.getSnapshot()), null);
  assert.equal((await session.send({ text: "new task" })).status, "dispatched");
  await session.stop();
  await session.close();
});

test("external task cancellation is shared even when no status slot is mounted", async () => {
  const { session, emit } = await setup();
  await session.send({ text: "task" });
  emit({ type: "state", taskState: "cancelling", workerState: "stopping" });
  assert.equal(session.getSnapshot().execution?.state, "cancelling");
  assert.equal((await session.send({ text: "too early" })).status, "rejected");
  emit({ type: "state", taskState: "cancelled", workerState: "stopped" });
  assert.equal(session.getSnapshot().phase, "idle");
  assert.equal(session.getSnapshot().execution?.state, "cancelled");
  await session.close();
});

test("subtasks stream separate thinking, text and tools, persist in order, and never settle the parent", async () => {
  const { session, emit, calls } = await setup();
  await session.send({ text: "Run workflow" });
  const taskId = session.getSnapshot().activeTaskId!;
  const child = (id: string, event: object, parent = taskId) =>
    emit(
      {
        type: E.SubtaskEvent,
        taskId: parent,
        subtaskId: id,
        title: `Step ${id}`,
        avatar: "data:image/svg+xml,%3Csvg%2F%3E",
        event: { taskId: id, ...event },
      },
      parent,
    );
  child("one", { type: E.Started });
  child("two", { type: E.Started });
  child("one", { type: E.ThinkingDelta, delta: "Thinking one" });
  child("two", { type: E.ThinkingDelta, delta: "Thinking two" });
  child("one", { type: E.ThinkingEnd, content: "Thinking one" });
  child("one", { type: E.TextDelta, delta: "Draft" });
  child("two", { type: E.ToolExecutionStart, toolCallId: "same", toolName: "read", args: {} });
  child("one", { type: E.ToolExecutionStart, toolCallId: "same", toolName: "write", args: {} });
  child("one", { type: E.ToolExecutionEnd, toolCallId: "same", toolName: "write", result: "ok", isError: false });
  await session.flush();
  const first = session.getSnapshot().messages[1];
  const second = session.getSnapshot().messages[2];
  assert.equal(first.role, "assistant");
  assert.equal(first.agentAvatar, "data:image/svg+xml,%3Csvg%2F%3E");
  assert.equal(first.parentMessageId, session.getSnapshot().messages.at(-1)!.id);
  assert.equal(visibleMessages(session.getSnapshot().messages).length, 3);
  assert.equal(second.role, "assistant");
  assert.ok(first.blocks.some((b: any) => b.type === "thinking" && b.content === "Thinking one"));
  assert.ok(second.blocks.some((b: any) => b.type === "thinking" && b.content === "Thinking two"));
  assert.ok(first.blocks.some((b: any) => b.type === "tool" && b.status === "done"));
  assert.ok(second.blocks.some((b: any) => b.type === "tool" && b.status === "running"));
  child("one", { type: E.Done, text: "Draft" });
  child("one", { type: E.TextDelta, delta: "late output" });
  child("two", { type: E.Error, message: "review failed" });
  child("foreign", { type: E.Started }, "old-parent");
  assert.equal(session.getSnapshot().activeTaskId, taskId);
  assert.equal(session.getSnapshot().messages.length, 4);
  assert.equal(session.getSnapshot().messages[1].status, "done");
  assert.equal(session.getSnapshot().messages[2].status, "error");
  emit({ type: E.Done, taskId, text: "Final summary" });
  await session.flush();
  assert.equal(session.getSnapshot().phase, "idle");
  assert.equal(calls.saved.at(-1).messages.length, 4);
  assert.doesNotMatch(JSON.stringify(calls.saved.at(-1)), /late output/);
  const restored = await setup({ storage: { load: async () => calls.saved.at(-1) } });
  assert.deepEqual(restored.session.getSnapshot().messages, session.getSnapshot().messages);
  await restored.session.close();
  await session.close();
});

test("cancelling preserves partial subtask output and settles only unfinished child messages", async () => {
  const { session, emit } = await setup();
  await session.send({ text: "Run" });
  const taskId = session.getSnapshot().activeTaskId!;
  const child = (subtaskId: string, event: object) =>
    emit({
      type: E.SubtaskEvent,
      taskId,
      subtaskId,
      title: subtaskId,
      event: { taskId: subtaskId, ...event },
    });
  child("one", { type: E.Started });
  child("one", { type: E.Done, text: "Completed step" });
  child("two", { type: E.Started });
  child("two", { type: E.ThinkingDelta, delta: "Partial thinking" });
  child("two", { type: E.TextDelta, delta: "Partial answer" });
  await session.stop();
  assert.equal(session.getSnapshot().messages[1].status, "done");
  assert.equal(session.getSnapshot().messages[2].status, "error");
  assert.match(JSON.stringify(session.getSnapshot().messages[2]), /Partial thinking/);
  assert.match(JSON.stringify(session.getSnapshot().messages[2]), /Partial answer/);
  await session.close();
});

test("coordinator placeholders hide only during delegated execution; plugin avatars bypass the host catalog", () => {
  const parent = { id: "parent", role: "assistant" as const, createdAt: 1, status: "loading" as const, blocks: [] };
  const child = { ...parent, id: "child", parentMessageId: "parent" };
  assert.deepEqual(visibleMessages([parent]), [parent]);
  assert.deepEqual(visibleMessages([child, parent]), [child]);
  const output = {
    ...parent,
    status: "streaming" as const,
    blocks: [{ id: "text", type: "text" as const, content: "Actual parent output" }],
  };
  assert.deepEqual(visibleMessages([child, output]), [child, output]);
  assert.equal(visibleMessages([child, { ...parent, status: "error" }]).length, 2);
  assert.equal(visibleMessages([child, { ...parent, status: "done" }]).length, 2);
  const builtin = (id: string) => {
    assert.equal(id, "cat-sky");
    return "/assets/cat.jpg";
  };
  assert.equal(messageAvatarSource("data:image/svg+xml,%3Csvg%2F%3E", builtin), "data:image/svg+xml,%3Csvg%2F%3E");
  assert.equal(messageAvatarSource("https://example.com/avatar.png", builtin), "https://example.com/avatar.png");
  assert.equal(messageAvatarSource("cat-sky", builtin), "/assets/cat.jpg");
  assert.equal(messageAvatarSource(undefined, builtin), undefined);
});

test("agent defaults remain empty and discarded role IDs cannot be restored", async () => {
  const { defaultConfig } = await import("../../src/chat/core/contracts");
  const resources = { agents: [{ value: "office", label: "Office", isDefault: true }] };
  assert.equal(defaultConfig(resources).selectedAgentId, "");
  assert.equal(defaultConfig(resources, { selectedAgentId: "old-role" }).selectedAgentId, "");
  assert.equal(defaultConfig(resources, { selectedAgentId: "office" }).selectedAgentId, "office");
});
