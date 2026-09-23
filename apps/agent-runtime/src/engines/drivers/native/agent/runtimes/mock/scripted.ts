import { randomUUID } from "node:crypto";
import type { JsonObject, ExtensionMessage } from "@isle/extension-host";
import { mockExtensionAdapter } from "./extensions/index.js";
import { createMockPluginRegistry } from "./extensions/registry.js";
import { AgentRuntimeEventType as Event } from "../../../../../protocol/wire.js";
import type { AgentRuntime, RuntimeAgent } from "../types.js";

export type MockAgentStep =
  | { type: "request" }
  | { type: "text"; text: string }
  | { type: "tool" | "command"; name: string; input: JsonObject }
  | { type: "compact"; summary?: string; fail?: string; reason?: "manual" | "threshold" | "overflow" };

/** A deterministic agent which executes real host tools, without a model or prompt parser. */
export function createScriptedMockRuntime(id: string, steps: readonly MockAgentStep[]): RuntimeAgent {
  const script = structuredClone(steps);
  const agent: AgentRuntime = {
    id,
    extensionAdapter: mockExtensionAdapter,
    async run(command, { emit, extensions, signal }) {
      signal?.throwIfAborted();
      emit({ type: Event.Started, taskId: command.taskId });
      const plugins = createMockPluginRegistry();
      if (extensions)
        plugins.register(
          mockExtensionAdapter.adapt(extensions, {
            taskId: command.taskId,
            runtimeId: id,
            signal,
          }),
        );
      let text = "";
      const request = await plugins.prepareRequest(command.agentTaskPrompt, command.systemPrompt ?? "");
      let turnIndex = -1;
      const completeMessage = async (message: ExtensionMessage) => {
        await plugins.notifyMessage({ phase: "start", message });
        await plugins.notifyMessage({ phase: "end", message });
      };
      const startTurn = async () => {
        await plugins.notifyTurn({ phase: "start", index: ++turnIndex, timestamp: Date.now() });
        if (turnIndex === 0)
          await completeMessage({
            id: randomUUID(),
            role: "user",
            content: [{ type: "text", text: request.text }],
            timestamp: Date.now(),
          });
      };
      const assistantMessage = async (
        content: ExtensionMessage["content"],
        stopReason: ExtensionMessage["stopReason"],
      ) => {
        const message: ExtensionMessage = { id: randomUUID(), role: "assistant", content: [], timestamp: Date.now() };
        await plugins.notifyMessage({ phase: "start", message });
        message.content = content;
        await plugins.notifyMessage({
          phase: "update",
          message,
          change:
            content.length === 1 && content[0].type === "text"
              ? { type: "text_delta", contentIndex: 0, delta: content[0].text }
              : { type: "snapshot" },
        });
        message.stopReason = stopReason;
        await plugins.notifyMessage({ phase: "end", message });
        return message;
      };
      for (const step of script) {
        signal?.throwIfAborted();
        if (step.type === "compact") {
          await plugins.compact(
            { reason: step.reason ?? "manual", willRetry: false, instructions: null, tokensBefore: 0 },
            async () => {
              if (step.fail) throw new Error(step.fail);
              return step.summary ?? null;
            },
            signal,
          );
          continue;
        }
        if (step.type === "text" || step.type === "request") {
          await startTurn();
          const delta = step.type === "text" ? step.text : JSON.stringify(request);
          const message = await assistantMessage([{ type: "text", text: delta }], "stop");
          text += delta;
          emit({
            type: Event.TextDelta,
            taskId: command.taskId,
            delta,
          });
          await plugins.notifyTurn({ phase: "end", index: turnIndex, message, results: [] });
          continue;
        }
        if (step.type === "command") {
          const value = await plugins.command(step.name, {
            id: randomUUID(),
            input: structuredClone(step.input),
            signal,
            update() {},
          });
          const delta = JSON.stringify(value);
          text += delta;
          emit({ type: Event.TextDelta, taskId: command.taskId, delta });
          continue;
        }
        const call = {
          taskId: command.taskId,
          toolCallId: randomUUID(),
          toolName: step.name,
        };
        await startTurn();
        const message = await assistantMessage(
          [{ type: "tool_call", callId: call.toolCallId, toolName: step.name, input: structuredClone(step.input) }],
          "tool",
        );
        const toolMessage = async (content: ExtensionMessage["content"], isError: boolean) => {
          const result: ExtensionMessage = {
            id: randomUUID(),
            role: "tool",
            content,
            callId: call.toolCallId,
            toolName: step.name,
            isError,
            timestamp: Date.now(),
          };
          await completeMessage(result);
          await plugins.notifyTurn({ phase: "end", index: turnIndex, message, results: [result] });
        };
        emit({ type: Event.ToolCallStart, ...call });
        emit({
          type: Event.ToolCallEnd,
          ...call,
          args: structuredClone(step.input),
        });
        emit({
          type: Event.ToolExecutionStart,
          ...call,
          args: structuredClone(step.input),
        });
        try {
          await plugins.notify({
            phase: "start",
            id: call.toolCallId,
            name: step.name,
          });
          const { isError, ...result } = await plugins.tool(step.name, {
            input: structuredClone(step.input),
            id: call.toolCallId,
            signal,
            update: (partialResult) => emit({ type: Event.ToolExecutionUpdate, ...call, partialResult }),
          });
          emit({
            type: Event.ToolExecutionEnd,
            ...call,
            isError,
            result,
          });
          await plugins.notify({
            phase: "end",
            id: call.toolCallId,
            name: step.name,
            failed: isError,
          });
          await toolMessage(result.content, isError);
          const delta = result.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
          text += delta;
          emit({ type: Event.TextDelta, taskId: command.taskId, delta });
        } catch (error) {
          emit({
            type: Event.ToolExecutionEnd,
            ...call,
            isError: true,
            result: error instanceof Error ? error.message : String(error),
          });
          await plugins.notify({
            phase: "end",
            id: call.toolCallId,
            name: step.name,
            failed: true,
          });
          if (!signal?.aborted)
            await toolMessage([{ type: "text", text: error instanceof Error ? error.message : String(error) }], true);
          throw error;
        }
      }
      signal?.throwIfAborted();
      emit({ type: Event.Done, taskId: command.taskId, text });
      return { text };
    },
  };
  return {
    id,
    label: "Scripted Mock",
    description: "执行真实插件工具的脚本 Mock。",
    capabilities: ["agent"],
    requiresModel: false,
    agent,
  };
}
