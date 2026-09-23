import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { defineExtensionAdapter, resolveExtensionAdaptation } from "@isle/extension-host";

export async function verifyExtensionAdapters({ piExtensionAdapter, mockExtensionAdapter, createMockPluginRegistry }) {
  const packageConfig = JSON.parse(
    await readFile(
      new URL("../src/engines/drivers/native/agent/runtimes/pi/package.config.json", import.meta.url),
      "utf8",
    ),
  );
  const baseline = packageConfig.isle.extensionCompatibility.pi;
  const piRoot = new URL("../../../ai/pi/packages/coding-agent/", import.meta.url);
  const metadata = JSON.parse(await readFile(new URL("package.json", piRoot), "utf8"));
  assert.equal(metadata.name, baseline.package);
  assert.equal(metadata.version, baseline.version, "Pi 版本变化后需重新审查插件能力矩阵");
  const types = await readFile(new URL("src/core/extensions/types.ts", piRoot));
  assert.equal(
    createHash("sha256").update(types).digest("hex"),
    baseline.extensionTypesSha256,
    "Pi 插件 API 变化后需更新兼容矩阵与行为测试，不能仅替换基准哈希",
  );
  const required = [
    {
      id: "example.adapter",
      capabilities: ["tools", "skills", "commands", "events.tool", "events.run", "session.state"],
    },
  ];
  const report = resolveExtensionAdaptation(piExtensionAdapter, required);
  assert.equal(report.degraded, false);
  assert.equal(report.mappings.find((item) => item.capability === "events.run").mode, "simulate");
  const custom = (capabilities) => ({
    id: "custom",
    protocolVersion: 1,
    capabilities,
    adapt: () => () => {},
  });
  assert.throws(() => resolveExtensionAdaptation(custom({}), required), /所需能力/);
  assert.throws(() => defineExtensionAdapter({ ...custom({}), protocolVersion: 2 }), /协议版本/);
  assert.throws(() => defineExtensionAdapter(custom({ tools: { mode: "ignore" } })), /原因/);
  assert.throws(() => defineExtensionAdapter(custom({ tools: { mode: "pretend" } })), /无效/);
  for (const mode of ["ignore", "noop"]) {
    const degraded = resolveExtensionAdaptation(
      defineExtensionAdapter(custom({ tools: { mode, reason: "测试降级策略" } })),
      [{ id: "example", capabilities: ["tools"] }],
    );
    assert.equal(degraded.degraded, true);
    assert.equal(degraded.mappings[0].mode, mode);
  }
  assert.throws(
    () =>
      resolveExtensionAdaptation(custom({ tools: { mode: "error", reason: "不可模拟" } }), [
        { id: "example", capabilities: ["tools"] },
      ]),
    /不可模拟/,
  );

  const calls = [];
  const events = [];
  const output = {
    content: [{ type: "text", text: "工具返回" }],
    details: { count: 1 },
  };
  const binding = {
    protocolVersion: 1,
    catalog: {
      tools: [
        {
          id: "example/tool",
          name: "ext_example__tool",
          label: "测试",
          description: "测试",
          parameters: { type: "object" },
        },
      ],
      commands: [
        {
          id: "example/list",
          description: "列表",
          parameters: { type: "object" },
        },
      ],
      skills: [{ id: "example/skill", description: "精确统计", content: "不得估算" }],
      subscriptions: [],
      middleware: [],
    },
    async execute(name, input, options) {
      calls.push({ name, input, id: options.callId, signal: options.signal });
      options.progress?.(output);
      return output;
    },
    async command(name, input, options) {
      calls.push({ name, input, id: options.callId });
      return { items: ["one"] };
    },
    async notify(event) {
      events.push(event);
    },
    async intercept(type, data) {
      return { action: "continue", value: data };
    },
  };
  const controller = new AbortController();
  const context = {
    taskId: "adapter-run",
    runtimeId: "pi",
    signal: controller.signal,
  };
  assert.throws(() => piExtensionAdapter.adapt({ ...binding, protocolVersion: 2 }, context), /协议版本/);
  const tools = new Map(),
    commands = new Map(),
    hooks = new Map(),
    messages = [];
  const pi = {
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    on(name, handler) {
      hooks.set(name, handler);
    },
    sendMessage(message) {
      messages.push(message);
    },
  };
  await piExtensionAdapter.adapt(binding, context)(pi);
  assert.deepEqual([...tools.keys()], ["ext_example__tool"]);
  assert.deepEqual([...commands.keys()], ["example/list"]);
  let progress;
  assert.deepEqual(
    await tools.get("ext_example__tool").execute("native-call", { text: "hello" }, controller.signal, (value) => {
      progress = value;
    }),
    output,
  );
  assert.deepEqual(progress, output);
  assert.equal(calls.at(-1).signal, controller.signal);
  const prompt = await hooks.get("before_agent_start")({
    systemPrompt: "原始提示",
  });
  assert.match(prompt.systemPrompt, /^原始提示/);
  assert.match(prompt.systemPrompt, /不得估算/);
  await commands.get("example/list").handler('{"page":1}');
  assert.deepEqual(calls.at(-1).input, { page: 1 });
  assert.equal(messages.at(-1).content, '{"items":["one"]}');
  const beforeInvalid = calls.length;
  await assert.rejects(() => commands.get("example/list").handler("not-json"), SyntaxError);
  assert.equal(calls.length, beforeInvalid);
  await hooks.get("tool_execution_start")({
    toolCallId: "native-call",
    toolName: "ext_example__tool",
  });
  await hooks.get("tool_execution_end")({
    toolCallId: "native-call",
    toolName: "ext_example__tool",
    isError: false,
  });
  const piEvents = events.splice(0);
  assert.equal(piEvents.length, 2);
  assert.equal(piEvents[1].taskId, context.taskId);

  const mock = createMockPluginRegistry();
  mock.register(mockExtensionAdapter.adapt(binding, { ...context, runtimeId: "mock" }));
  assert.match(mock.instructions, /不得估算/);
  assert.deepEqual(
    await mock.tool("ext_example__tool", {
      id: "native-call",
      input: {},
      signal: controller.signal,
      update() {},
    }),
    { ...output, isError: false },
  );
  assert.deepEqual(
    await mock.command("example/list", {
      id: "native-command",
      input: {},
      update() {},
    }),
    { items: ["one"] },
  );
  await mock.notify({
    phase: "start",
    id: "native-call",
    name: "ext_example__tool",
  });
  await mock.notify({
    phase: "end",
    id: "native-call",
    name: "ext_example__tool",
    failed: false,
  });
  assert.deepEqual(events, piEvents);
  const nativeMessages = [
    { role: "user", content: "original", timestamp: 1 },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "opaque", thinkingSignature: "signed" },
        { type: "toolCall", id: "call", name: "read", arguments: { path: "a" } },
      ],
      timestamp: 2,
      provider: "native",
      usage: { totalTokens: 9 },
    },
    {
      role: "toolResult",
      toolCallId: "call",
      toolName: "read",
      content: [{ type: "image", data: "base64", mimeType: "image/png" }],
      details: { retained: true },
      isError: false,
      timestamp: 3,
    },
  ];
  const contextIds = [];
  const factory = piExtensionAdapter.adapt(
    {
      ...binding,
      catalog: { ...binding.catalog, middleware: [{ id: "example/context", extensionId: "example", type: "context" }] },
      async intercept(type, data) {
        assert.equal(type, "context");
        contextIds.push(data.messages[0].id);
        assert.equal(data.messages[1].text, undefined);
        assert.equal(data.messages[2].text, undefined);
        assert.deepEqual(
          data.messages.map((m) => m.role),
          ["user", "assistant", "tool"],
        );
        return {
          action: "continue",
          value: {
            messages: [
              { ...data.messages[0], text: "edited" },
              ...data.messages.slice(1),
              { role: "user", text: "added" },
            ],
          },
        };
      },
    },
    context,
  );
  await factory(pi);
  const transformed = await hooks.get("context")({ messages: nativeMessages });
  assert.equal(transformed.messages[0].content, "edited");
  assert.deepEqual(transformed.messages.slice(1, 3), nativeMessages.slice(1));
  assert.equal(transformed.messages[3].content, "added");
  assert.equal(nativeMessages[0].content, "original");
  await hooks.get("context")({ messages: nativeMessages });
  assert.notEqual(contextIds[0], contextIds[1], "消息引用只对本次请求有效");
  factory.assertHealthy();
  // Pi emits shallow streaming copies and can reset its turn counter within one Isle run.
  events.length = 0;
  const conversationHooks = new Map();
  await piExtensionAdapter.adapt(
    {
      ...binding,
      catalog: {
        ...binding.catalog,
        subscriptions: [
          {
            extensionId: "example",
            events: ["turn_started", "turn_finished", "message_started", "message_updated", "message_finished"],
          },
        ],
      },
    },
    context,
  )({ ...pi, on: (name, handler) => conversationHooks.set(name, handler) });
  const emitNative = (name, value) => conversationHooks.get(name)(value);
  const assistant = { ...nativeMessages[1], stopReason: "toolUse" };
  await emitNative("turn_start", { turnIndex: 0, timestamp: 1 });
  await emitNative("message_start", { message: { ...assistant, content: [] } });
  await emitNative("message_update", {
    message: { ...assistant },
    assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "opaque" },
  });
  await emitNative("message_end", { message: assistant });
  await emitNative("message_start", { message: nativeMessages[2] });
  await emitNative("message_end", { message: nativeMessages[2] });
  await emitNative("turn_end", { turnIndex: 0, message: assistant, toolResults: [nativeMessages[2]] });
  const started = events.find((e) => e.type === "message_started").message;
  const updated = events.find((e) => e.type === "message_updated").message;
  const finished = events.find((e) => e.type === "message_finished").message;
  assert.equal(started.id, updated.id);
  assert.equal(started.id, finished.id);
  assert.deepEqual(updated.content, [
    { type: "thinking", text: "opaque" },
    { type: "tool_call", callId: "call", toolName: "read", input: { path: "a" } },
  ]);
  assert.deepEqual(events.at(-1).message, finished);
  assert.equal(events.at(-1).toolResults[0].id, events.at(-2).message.id);
  assert.deepEqual(events.at(-1).toolResults[0].content, nativeMessages[2].content);
  assert.equal(finished.stopReason, "tool");
  await emitNative("turn_start", { turnIndex: 0, timestamp: 4 });
  assert.equal(events.at(-1).turnIndex, 1, "同一 Isle 运行中的追加 prompt 不重置回合索引");
  const customMessage = {
    role: "custom",
    customType: "sample",
    content: "custom",
    details: { nested: true },
    timestamp: 5,
  };
  await emitNative("message_start", { message: customMessage });
  await emitNative("message_end", { message: customMessage });
  assert.deepEqual(events.at(-1).message.content, [
    { type: "opaque", format: "pi.message.custom", data: customMessage },
  ]);
  events.at(-1).message.content[0].data.details.nested = false;
  assert.equal(customMessage.details.nested, true, "opaque 数据也必须脱离原生对象");
  const failedCompaction = piExtensionAdapter.adapt(
    {
      ...binding,
      catalog: {
        ...binding.catalog,
        middleware: [{ id: "example/compact", extensionId: "example", type: "session_compact" }],
        subscriptions: [{ extensionId: "example", events: ["session_compact_finished"] }],
      },
      async intercept() {
        throw new Error("");
      },
    },
    context,
  );
  await failedCompaction({ ...pi, on: (name, handler) => conversationHooks.set(name, handler) });
  assert.deepEqual(
    await emitNative("session_before_compact", {
      reason: "threshold",
      willRetry: false,
      preparation: { tokensBefore: 10 },
      signal: controller.signal,
    }),
    { cancel: true },
  );
  await emitNative("session_compact_failed", { reason: "threshold", aborted: true });
  assert.equal(events.at(-1).status, "failed", "空错误消息也必须保留中间件失败语义");
  assert.throws(() => failedCompaction.assertHealthy());
  console.log("PASS 统一适配契约、版本/能力诊断、Pi 原生工厂和 Mock 注册、命令/技能/事件映射");
}
