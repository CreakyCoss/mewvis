import { randomUUID } from "node:crypto";
import type { ExtensionAPI, MessageStartEvent, MessageUpdateEvent } from "@earendil-works/pi-coding-agent";
import type {
  ExtensionBindings,
  ExtensionMessage,
  ExtensionMessageContent,
  ExtensionMessageChange,
  JsonValue,
} from "@isle/extension-sdk";

type NativeMessage = MessageStartEvent["message"];
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));

function content(message: NativeMessage): ExtensionMessageContent[] {
  if (message.role !== "user" && message.role !== "assistant" && message.role !== "toolResult")
    return [{ type: "opaque", format: `pi.message.${message.role}`, data: json(message) }];
  if (typeof message.content === "string") return [{ type: "text", text: message.content }];
  return message.content.map((block): ExtensionMessageContent => {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text };
      case "thinking":
        return { type: "thinking", text: block.thinking };
      case "image":
        return { type: "image", data: block.data, mimeType: block.mimeType };
      case "toolCall":
        return {
          type: "tool_call",
          callId: block.id,
          toolName: block.name,
          input: json(block.arguments) as Record<string, JsonValue>,
        };
      default:
        return { type: "opaque", format: "pi.content", data: json(block) };
    }
  });
}

/** Pi streams shallow copies. Track the active message, then retain final object identity for turn_end. */
export function createPiMessageProjector() {
  const active = new Map<string, string>();
  const ids = new WeakMap<NativeMessage, string>();
  return (message: NativeMessage, phase: "start" | "update" | "end" | "reference"): ExtensionMessage => {
    const key = message.role === "toolResult" ? `tool:${message.toolCallId}` : message.role;
    const id = phase === "start" ? randomUUID() : (ids.get(message) ?? active.get(key) ?? randomUUID());
    ids.set(message, id);
    if (phase === "start" || phase === "update") active.set(key, id);
    if (phase === "end") active.delete(key);
    return {
      id,
      role:
        message.role === "user" || message.role === "assistant"
          ? message.role
          : message.role === "toolResult"
            ? "tool"
            : "other",
      content: content(message),
      ...("timestamp" in message && typeof message.timestamp === "number" ? { timestamp: message.timestamp } : {}),
      ...(message.role === "toolResult"
        ? { callId: message.toolCallId, toolName: message.toolName, isError: message.isError }
        : {}),
      ...(message.role === "assistant"
        ? {
            stopReason: (
              {
                stop: "stop",
                toolUse: "tool",
                length: "length",
                error: "error",
                aborted: "cancelled",
                pending: "other",
                deferred: "other",
              } as const
            )[message.stopReason],
          }
        : {}),
    };
  };
}

function change(event: MessageUpdateEvent["assistantMessageEvent"]): ExtensionMessageChange {
  if (event.type === "text_delta" || event.type === "thinking_delta" || event.type === "toolcall_delta")
    return {
      type: event.type === "toolcall_delta" ? "tool_call_delta" : event.type,
      contentIndex: event.contentIndex,
      delta: event.delta,
    };
  return { type: "snapshot" };
}

export function registerPiConversationEvents(pi: ExtensionAPI, bindings: ExtensionBindings, taskId: string) {
  const watched = new Set(bindings.catalog.subscriptions.flatMap((item) => item.events));
  if (![...watched].some((type) => type.startsWith("message_") || type.startsWith("turn_"))) return;
  const project = createPiMessageProjector();
  // One Isle run can prompt Pi again after ask-user; Pi resets its own counter each time.
  let turnIndex = -1;
  const notify: ExtensionBindings["notify"] = async (event) => {
    if (watched.has(event.type)) await bindings.notify(event);
  };
  pi.on("message_start", (event) =>
    notify({ type: "message_started", taskId, message: project(event.message, "start") }),
  );
  if (watched.has("message_updated"))
    pi.on("message_update", (event) =>
      notify({
        type: "message_updated",
        taskId,
        message: project(event.message, "update"),
        change: change(event.assistantMessageEvent),
      }),
    );
  pi.on("message_end", (event) => notify({ type: "message_finished", taskId, message: project(event.message, "end") }));
  pi.on("turn_start", (event) =>
    notify({ type: "turn_started", taskId, turnIndex: ++turnIndex, timestamp: event.timestamp }),
  );
  pi.on("turn_end", (event) =>
    notify({
      type: "turn_finished",
      taskId,
      turnIndex,
      message: project(event.message, "reference"),
      toolResults: event.toolResults.map((message) => project(message, "reference")),
    }),
  );
}
