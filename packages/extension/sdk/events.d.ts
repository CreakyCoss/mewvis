import type { JsonObject, JsonValue } from "./index.js";
import type { ExtensionCompactionResult } from "./session.js";

/** Portable snapshots, not editable native messages or context middleware references. */
export type ExtensionMessageContent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "tool_call"; callId: string; toolName: string; input: JsonObject }
  | { type: "opaque"; format: string; data: JsonValue };

export interface ExtensionMessage {
  /** Stable from message_started through message_finished and turn_finished, within this run only. */
  id: string;
  role: "user" | "assistant" | "tool" | "other";
  content: ExtensionMessageContent[];
  timestamp?: number;
  callId?: string;
  toolName?: string;
  isError?: boolean;
  stopReason?: "stop" | "tool" | "length" | "error" | "cancelled" | "other";
}

/** Each update also includes a full snapshot. Deltas are optional hints, never required for reconstruction. */
export type ExtensionMessageChange =
  | { type: "snapshot" }
  | { type: "text_delta" | "thinking_delta" | "tool_call_delta"; contentIndex: number; delta: string };

export type ExtensionAgentEvent =
  | ({ type: "session_compact_finished"; taskId: string } & ExtensionCompactionResult)
  | { type: "run_started"; taskId: string; runtimeId: string }
  | { type: "tool_started"; taskId: string; callId: string; toolName: string }
  | { type: "tool_finished"; taskId: string; callId: string; toolName: string; isError: boolean }
  | { type: "turn_started"; taskId: string; turnIndex: number; timestamp: number }
  | {
      type: "turn_finished";
      taskId: string;
      turnIndex: number;
      message: ExtensionMessage;
      toolResults: ExtensionMessage[];
    }
  | { type: "message_started"; taskId: string; message: ExtensionMessage }
  | { type: "message_finished"; taskId: string; message: ExtensionMessage }
  | { type: "message_updated"; taskId: string; message: ExtensionMessage; change: ExtensionMessageChange }
  | { type: "run_finished"; taskId: string; status: "completed" | "failed" | "cancelled" };

export const extensionEventCapabilities: Readonly<
  Record<
    ExtensionAgentEvent["type"],
    "events.run" | "events.tool" | "events.turn" | "events.message" | "events.session"
  >
>;
