import type { JsonObject, JsonValue } from "../shared.js";
import type { ExtensionCompactionRequest } from "./session.js";

/** A request-local reference preserves native metadata and non-text blocks in the Agent adapter. */
export interface ExtensionContextMessage {
  id?: string;
  role: "user" | "assistant" | "tool" | "other";
  /** Present only for wholly textual content. New messages omit id and must be user text. */
  text?: string;
}
export interface ExtensionResultView {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  details: JsonValue;
  isError: boolean;
}
export interface ExtensionMiddlewareData {
  session_compact: ExtensionCompactionRequest;
  input: { text: string };
  system_prompt: { text: string };
  context: { messages: ExtensionContextMessage[] };
  tool_call: { callId: string; toolName: string; input: JsonObject };
  tool_result: {
    callId: string;
    toolName: string;
    result: ExtensionResultView;
  };
}
export type ExtensionMiddlewareType = keyof ExtensionMiddlewareData;
export type ExtensionMiddlewareResult<T extends ExtensionMiddlewareType> =
  | { action: "continue" }
  | (T extends "session_compact"
      ? never
      : { action: "replace"; value: ExtensionMiddlewareData[T] })
  | (T extends "input" | "tool_call" | "session_compact"
      ? { action: "block"; reason: string }
      : never);
export type ExtensionMiddlewareOutcome<T extends ExtensionMiddlewareType> =
  | { action: "continue"; value: ExtensionMiddlewareData[T] }
  | { action: "block"; reason: string };
export type ExtensionMiddlewareHandler<T extends ExtensionMiddlewareType> = (
  data: ExtensionMiddlewareData[T],
  context: { signal: AbortSignal },
) => ExtensionMiddlewareResult<T> | Promise<ExtensionMiddlewareResult<T>>;
