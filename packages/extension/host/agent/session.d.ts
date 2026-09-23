import type { JsonValue } from "../shared.js";

/** Valid inside tools, commands, observers and middleware. Commits when the handler and result validation succeed. */
export interface ExtensionSessionState {
  get(key: string): JsonValue | undefined;
  set(key: string, value: JsonValue): void;
  delete(key: string): void;
}

/** One native compaction attempt; no native session paths or entry types cross this boundary. */
export interface ExtensionCompactionRequest {
  operationId: string;
  reason: "manual" | "threshold" | "overflow";
  willRetry: boolean;
  instructions: string | null;
  tokensBefore: number;
}
export interface ExtensionCompactionResult {
  operationId: string;
  reason: ExtensionCompactionRequest["reason"];
  status: "completed" | "blocked" | "failed" | "cancelled" | "skipped";
  summary: string | null;
  message: string | null;
}
