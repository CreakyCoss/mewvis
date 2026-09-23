import { randomUUID } from "node:crypto";
import { defineExtensionAdapter } from "@isle/extension-host";
import type { ExtensionMiddlewareType, ExtensionMiddlewareData, JsonValue, JsonObject } from "@isle/extension-host";
import { projectPiContext } from "./context.js";
import { registerPiConversationEvents } from "./events.js";
import { registerPiCompactionHooks } from "./compaction.js";
export { isPiCompactionSkipped } from "./compaction.js";
import type { AgentSession, ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";

/** Preserve middleware failure identity across Pi's swallowed hook errors and native error text. */
export class PiExtensionFailure extends Error {
  constructor(error: unknown) {
    super(error instanceof Error ? error.message : String(error), { cause: error });
    this.name = "PiExtensionFailure";
  }
}

/** Pi catches several native hook errors; stop at request/execution boundaries as well. */
export function installPiExtensionGuards(session: AgentSession, healthy: () => void) {
  const compact = session.compact.bind(session);
  session.compact = async (...args) => {
    healthy();
    try {
      return await compact(...args);
    } finally {
      healthy();
    }
  };
  const prompt = session.prompt.bind(session);
  session.prompt = async (...args) => {
    healthy();
    await prompt(...args);
    healthy();
  };
  const transform = session.agent.transformContext;
  session.agent.transformContext = async (messages, signal) => {
    healthy();
    const result = (await transform?.(messages, signal)) ?? messages;
    healthy();
    return result;
  };
  const before = session.agent.beforeToolCall;
  session.agent.beforeToolCall = async (context, signal) => {
    healthy();
    const result = await before?.(context, signal);
    healthy();
    return result;
  };
  const after = session.agent.afterToolCall;
  session.agent.afterToolCall = async (context, signal) => {
    healthy();
    const result = await after?.(context, signal);
    healthy();
    // Pi merges details with ??; a deliberate JSON null must still clear the previous value.
    if (result?.details === null) context.result.details = null;
    return result;
  };
}

/** Produces an ordinary Pi extension factory; all executable contributions call the Isle host ports. */
export type PiExtensionFactory = ExtensionFactory & { assertHealthy(): void };
export const piExtensionAdapter = defineExtensionAdapter<PiExtensionFactory>({
  id: "pi",
  protocolVersion: 1,
  capabilities: {
    tools: { mode: "direct" },
    commands: { mode: "direct" },
    skills: {
      mode: "simulate",
      reason: "内联技能通过 Pi before_agent_start 注入本轮系统提示",
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
    "middleware.context": { mode: "simulate", reason: "原生 context 钩子投影文本和消息引用，保留 Pi 原生元数据" },
    "middleware.tool_call": { mode: "direct" },
    "middleware.tool_result": { mode: "direct" },
  },
  adapt(bindings, context) {
    let failure: Error | undefined;
    const assertHealthy = () => {
      if (failure) throw failure;
      context.signal?.throwIfAborted();
    };
    const fail = (error: unknown): never => {
      failure ??= new PiExtensionFailure(error);
      throw failure;
    };
    const intercept = async <T extends ExtensionMiddlewareType>(
      type: T,
      data: ExtensionMiddlewareData[T],
      signal?: AbortSignal,
    ) => {
      assertHealthy();
      try {
        return await bindings.intercept(type, data, {
          signal: signal && context.signal ? AbortSignal.any([signal, context.signal]) : (signal ?? context.signal),
        });
      } catch (error) {
        return fail(error);
      }
    };
    const has = (type: ExtensionMiddlewareType) => bindings.catalog.middleware.some((item) => item.type === type);
    const factory: ExtensionFactory = (pi) => {
      registerPiConversationEvents(pi, bindings, context.taskId);
      registerPiCompactionHooks(pi, bindings, context.taskId, (data, signal) =>
        intercept("session_compact", data, signal),
      );
      for (const tool of bindings.catalog.tools) {
        pi.registerTool({
          name: tool.name,
          label: tool.label,
          description: tool.description,
          parameters: tool.parameters as Parameters<ExtensionAPI["registerTool"]>[0]["parameters"],
          execute: (callId, input, signal, progress) =>
            bindings.execute(tool.name, input, { callId, signal, progress }),
        });
      }
      for (const command of bindings.catalog.commands) {
        pi.registerCommand(command.id, {
          description: command.description,
          handler: async (args) => {
            const value = await bindings.command(command.id, JSON.parse(args.trim() || "{}"), {
              callId: randomUUID(),
              signal: context.signal,
            });
            pi.sendMessage({
              customType: "isle.extension.command",
              content: JSON.stringify(value),
              display: true,
              details: { commandId: command.id, value },
            });
          },
        });
      }
      if (has("input"))
        pi.on("input", async (event) => {
          try {
            const reply = await intercept("input", { text: event.text });
            if (reply.action === "block") return fail(new Error(reply.reason));
            return { action: "transform", text: reply.value.text };
          } catch {
            return { action: "handled" };
          }
        });
      if (bindings.catalog.skills.length || has("system_prompt")) {
        const skills = bindings.catalog.skills
          .map((skill) => `### ${skill.id}\n${skill.description}\n${skill.content}`)
          .join("\n\n");
        pi.on("before_agent_start", async (event) => {
          const text = skills ? `${event.systemPrompt}\n\n已启用的插件技能：\n${skills}` : event.systemPrompt;
          if (!has("system_prompt")) return { systemPrompt: text };
          const reply = await intercept("system_prompt", { text });
          if (reply.action === "block") return fail(new Error(reply.reason));
          return { systemPrompt: reply.value.text };
        });
      }
      if (has("context"))
        pi.on("context", async (event) => {
          try {
            const projected = projectPiContext(event.messages);
            const reply = await intercept("context", { messages: projected.messages });
            if (reply.action === "block") return fail(new Error(reply.reason));
            return { messages: projected.restore(reply.value.messages) };
          } catch (error) {
            return fail(error);
          }
        });
      if (has("tool_call"))
        pi.on("tool_call", async (event) => {
          const input = event.input as JsonObject;
          const reply = await intercept("tool_call", { callId: event.toolCallId, toolName: event.toolName, input });
          if (reply.action === "block") return { block: true, reason: reply.reason };
          // Pi explicitly exposes mutable final arguments here; validation and approval follow this hook.
          for (const key of Object.keys(input)) delete input[key];
          Object.defineProperties(input, Object.getOwnPropertyDescriptors(reply.value.input));
        });
      if (has("tool_result"))
        pi.on("tool_result", async (event) => {
          try {
            const data = {
              callId: event.toolCallId,
              toolName: event.toolName,
              result: {
                content: event.content.map((block) =>
                  block.type === "text"
                    ? { type: "text" as const, text: block.text }
                    : { type: "image" as const, data: block.data, mimeType: block.mimeType },
                ),
                details: JSON.parse(JSON.stringify(event.details ?? null)) as JsonValue,
                isError: event.isError,
              },
            };
            const reply = await intercept("tool_result", data);
            if (reply.action === "block") return fail(new Error(reply.reason));
            if (JSON.stringify(reply.value) === JSON.stringify(data)) return;
            return reply.value.result;
          } catch (error) {
            return fail(error);
          }
        });
      pi.on("tool_execution_start", (event) =>
        bindings.notify({
          type: "tool_started",
          taskId: context.taskId,
          callId: event.toolCallId,
          toolName: event.toolName,
        }),
      );
      pi.on("tool_execution_end", (event) =>
        bindings.notify({
          type: "tool_finished",
          taskId: context.taskId,
          callId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
        }),
      );
    };
    return Object.assign(factory, { assertHealthy });
  },
});
