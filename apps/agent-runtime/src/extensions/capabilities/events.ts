import { isJsonValue } from "@earendil-works/chord";
import type { ExtensionAgentEvent } from "@isle/extension-sdk";
import { z } from "zod";

const id = z.string().min(1);
const json = z.unknown().refine(isJsonValue, "必须为 JSON");
const content = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }).strict(),
  z.object({ type: z.literal("thinking"), text: z.string() }).strict(),
  z.object({ type: z.literal("image"), data: z.string(), mimeType: id }).strict(),
  z
    .object({
      type: z.literal("tool_call"),
      callId: z.string(),
      toolName: z.string(),
      input: z.record(z.string(), json),
    })
    .strict(),
  z.object({ type: z.literal("opaque"), format: id, data: json }).strict(),
]);
const message = z
  .object({
    id,
    role: z.enum(["user", "assistant", "tool", "other"]),
    content: z.array(content),
    timestamp: z.number().nonnegative().optional(),
    callId: id.optional(),
    toolName: id.optional(),
    isError: z.boolean().optional(),
    stopReason: z.enum(["stop", "tool", "length", "error", "cancelled", "other"]).optional(),
  })
  .strict();
const change = z.union([
  z.object({ type: z.literal("snapshot") }).strict(),
  z
    .object({
      type: z.enum(["text_delta", "thinking_delta", "tool_call_delta"]),
      contentIndex: z.number().int().nonnegative(),
      delta: z.string(),
    })
    .strict(),
]);
const event = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("session_compact_finished"),
      taskId: id,
      operationId: id,
      reason: z.enum(["manual", "threshold", "overflow"]),
      status: z.enum(["completed", "blocked", "failed", "cancelled", "skipped"]),
      summary: z.string().nullable(),
      message: z.string().nullable(),
    })
    .strict(),
  z.object({ type: z.literal("run_started"), taskId: id, runtimeId: id }).strict(),
  z
    .object({ type: z.literal("run_finished"), taskId: id, status: z.enum(["completed", "failed", "cancelled"]) })
    .strict(),
  z.object({ type: z.literal("tool_started"), taskId: id, callId: id, toolName: id }).strict(),
  z.object({ type: z.literal("tool_finished"), taskId: id, callId: id, toolName: id, isError: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("turn_started"),
      taskId: id,
      turnIndex: z.number().int().nonnegative(),
      timestamp: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("turn_finished"),
      taskId: id,
      turnIndex: z.number().int().nonnegative(),
      message,
      toolResults: z.array(message),
    })
    .strict(),
  z.object({ type: z.literal("message_started"), taskId: id, message }).strict(),
  z.object({ type: z.literal("message_updated"), taskId: id, message, change }).strict(),
  z.object({ type: z.literal("message_finished"), taskId: id, message }).strict(),
]);

export function validateExtensionEvent(value: unknown): ExtensionAgentEvent {
  if (!isJsonValue(value)) throw new Error("插件事件必须为 JSON");
  const parsed = event.parse(value);
  if (
    parsed.type === "message_updated" &&
    parsed.change.type !== "snapshot" &&
    parsed.change.contentIndex >= parsed.message.content.length
  )
    throw new Error("插件消息更新引用了不存在的内容块");
  return parsed;
}
