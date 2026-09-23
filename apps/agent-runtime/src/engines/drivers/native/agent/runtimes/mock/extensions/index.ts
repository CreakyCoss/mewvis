import { defineExtensionAdapter } from "@isle/extension-host";
import type { MockPlugin } from "./registry.js";

export const mockExtensionAdapter = defineExtensionAdapter<MockPlugin>({
  id: "scripted-mock",
  protocolVersion: 1,
  capabilities: {
    tools: { mode: "direct" },
    commands: { mode: "direct" },
    skills: {
      mode: "simulate",
      reason: "内联技能注册为 Mock 指令；脚本不模拟模型推理",
    },
    "events.tool": { mode: "direct" },
    "events.turn": { mode: "direct" },
    "events.message": { mode: "direct" },
    "events.session": { mode: "direct" },
    "middleware.session_compact": { mode: "direct" },
    "events.run": {
      mode: "simulate",
      reason: "由 Isle 运行边界提供成功、失败与取消终态",
    },
    "session.state": { mode: "simulate", reason: "调用 Isle 会话状态事务服务" },
    "middleware.input": { mode: "direct" },
    "middleware.system_prompt": { mode: "direct" },
    "middleware.context": { mode: "direct" },
    "middleware.tool_call": { mode: "direct" },
    "middleware.tool_result": { mode: "direct" },
  },
  adapt(bindings, context) {
    return (mock) => {
      const watched = new Set(bindings.catalog.subscriptions.flatMap((item) => item.events));
      mock.onMessage(async (event) => {
        const type =
          event.phase === "start" ? "message_started" : event.phase === "end" ? "message_finished" : "message_updated";
        if (!watched.has(type)) return;
        await bindings.notify(
          type === "message_updated"
            ? { type, taskId: context.taskId, message: event.message, change: event.change ?? { type: "snapshot" } }
            : { type, taskId: context.taskId, message: event.message },
        );
      });
      mock.onTurn(async (event) => {
        if (event.phase === "start" && watched.has("turn_started"))
          await bindings.notify({
            type: "turn_started",
            taskId: context.taskId,
            turnIndex: event.index,
            timestamp: event.timestamp,
          });
        if (event.phase === "end" && watched.has("turn_finished"))
          await bindings.notify({
            type: "turn_finished",
            taskId: context.taskId,
            turnIndex: event.index,
            message: event.message,
            toolResults: event.results,
          });
      });
      const has = (type: string) => bindings.catalog.middleware.some((item) => item.type === type);
      if (has("session_compact"))
        mock.beforeCompact(async (data, signal) => {
          const reply = await bindings.intercept("session_compact", data, { signal: signal ?? context.signal });
          return reply.action === "block" ? reply.reason : undefined;
        });
      if (watched.has("session_compact_finished"))
        mock.onCompact((result) =>
          bindings.notify({ type: "session_compact_finished", taskId: context.taskId, ...result }),
        );
      if (has("input"))
        mock.onInput(async (text) => {
          const reply = await bindings.intercept("input", { text }, { signal: context.signal });
          if (reply.action === "block") throw new Error(reply.reason);
          return reply.value.text;
        });
      if (has("system_prompt"))
        mock.onSystemPrompt(async (text) => {
          const reply = await bindings.intercept("system_prompt", { text }, { signal: context.signal });
          if (reply.action === "block") throw new Error(reply.reason);
          return reply.value.text;
        });
      if (has("context"))
        mock.onContext(async (messages) => {
          const reply = await bindings.intercept("context", { messages }, { signal: context.signal });
          if (reply.action === "block") throw new Error(reply.reason);
          return reply.value.messages;
        });
      if (has("tool_call"))
        mock.beforeTool(async (name, call) => {
          const reply = await bindings.intercept(
            "tool_call",
            { callId: call.id, toolName: name, input: call.input },
            { signal: call.signal },
          );
          return reply.action === "block" ? { input: call.input, blocked: reply.reason } : { input: reply.value.input };
        });
      if (has("tool_result"))
        mock.afterTool(async (name, call, result) => {
          const reply = await bindings.intercept(
            "tool_result",
            { callId: call.id, toolName: name, result },
            { signal: call.signal },
          );
          if (reply.action === "block") throw new Error(reply.reason);
          return reply.value.result;
        });
      for (const tool of bindings.catalog.tools)
        mock.addTool(tool.name, (call) =>
          bindings.execute(tool.name, call.input, {
            callId: call.id,
            signal: call.signal,
            progress: call.update,
          }),
        );
      for (const command of bindings.catalog.commands)
        mock.addCommand(command.id, (call) =>
          bindings.command(command.id, call.input, {
            callId: call.id,
            signal: call.signal,
          }),
        );
      for (const skill of bindings.catalog.skills)
        mock.addInstructions(`### ${skill.id}\n${skill.description}\n${skill.content}`);
      mock.onTool((event) =>
        bindings.notify(
          event.phase === "start"
            ? {
                type: "tool_started",
                taskId: context.taskId,
                callId: event.id,
                toolName: event.name,
              }
            : {
                type: "tool_finished",
                taskId: context.taskId,
                callId: event.id,
                toolName: event.name,
                isError: !!event.failed,
              },
        ),
      );
    };
  },
});
