import { createHash } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import {
  KnowledgeError,
  type KnowledgeErrorCode,
  type KnowledgeErrorInfo,
  type KnowledgeJsonValue,
  type KnowledgeMetadata,
} from "@mewvis/knowledge-sdk";

export const now = () => new Date().toISOString();
export function fail(
  code: KnowledgeErrorCode,
  message: string,
  details?: KnowledgeMetadata,
): never {
  throw new KnowledgeError({ code, message, ...(details ? { details } : {}) });
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export const hash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export function safeError(error: unknown): KnowledgeErrorInfo {
  if (error instanceof KnowledgeError)
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      ...(error.retryAfterMs !== undefined
        ? { retryAfterMs: error.retryAfterMs }
        : {}),
    };
  return { code: "INTERNAL_ERROR", message: "Knowledge operation failed" };
}
export function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) fail("ABORTED", "Knowledge operation aborted");
}
export async function yieldTask(signal?: AbortSignal): Promise<void> {
  await setImmediate();
  checkSignal(signal);
}
export function positive(
  value: unknown,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined) return fallback;
  if (
    !Number.isSafeInteger(value) ||
    Number(value) <= 0 ||
    Number(value) > maximum
  )
    fail("INVALID_ARGUMENT", "Invalid knowledge service limit");
  return Number(value);
}
export const json = <T>(value: string): T => JSON.parse(value) as T;
export type JsonObject = Record<string, KnowledgeJsonValue>;
