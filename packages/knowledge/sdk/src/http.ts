import type { KnowledgeResponse, KnowledgeTransport } from "./contracts.js";
import { KnowledgeError } from "./errors.js";
import { isRecord } from "./validation.js";

export interface KnowledgeHttpTransportOptions {
  /** Exact RPC endpoint, not a third-party provider base URL. No path is appended. */
  readonly endpoint: string;
  /** Resolve authentication in the trusted caller. Never expose this transport to an untrusted app. */
  readonly headers?:
    | Readonly<Record<string, string>>
    | (() =>
        | Readonly<Record<string, string>>
        | Promise<Readonly<Record<string, string>>>);
  readonly fetch?: typeof globalThis.fetch;
  readonly maxResponseBytes?: number;
}

/** HTTP adapter for this SDK's v1 envelope. Dify/RAGFlow/etc. require their own provider adapters. */
export function createKnowledgeHttpTransport(
  options: KnowledgeHttpTransportOptions,
): KnowledgeTransport {
  let url: URL;
  try {
    url = new URL(options.endpoint);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new KnowledgeError({
      code: "INVALID_ARGUMENT",
      message: "Knowledge HTTP endpoint must be a credential-free HTTP(S) URL",
    });
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  const maxBytes = options.maxResponseBytes ?? 16 * 1024 * 1024;
  if (
    typeof fetcher !== "function" ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  )
    throw new KnowledgeError({
      code: "INVALID_ARGUMENT",
      message: "Invalid knowledge HTTP transport options",
    });
  const endpoint = url.href;
  const headerSource = options.headers;
  const staticHeaders =
    typeof headerSource === "function" ? undefined : new Headers(headerSource);
  return Object.freeze({
    version: 1,
    async request(request, context) {
      const headers = new Headers(
        staticHeaders ??
          (await (
            headerSource as
              | (() =>
                  | Readonly<Record<string, string>>
                  | Promise<Readonly<Record<string, string>>>)
              | undefined
          )?.()),
      );
      headers.set("content-type", "application/json");
      headers.set("accept", "application/json");
      context?.signal?.throwIfAborted();
      const response = await fetcher(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        ...(context?.signal ? { signal: context.signal } : {}),
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
      const reader = response.body?.getReader();
      let body = "";
      let bytes = 0;
      if (reader) {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > maxBytes)
              throw new KnowledgeError({
                code: "INVALID_RESPONSE",
                message:
                  "Knowledge HTTP response exceeded the configured size limit",
              });
            body += decoder.decode(part.value, { stream: true });
          }
          body += decoder.decode();
        } catch (cause) {
          await reader.cancel().catch(() => {});
          if (cause instanceof KnowledgeError || context?.signal?.aborted)
            throw cause;
          throw new KnowledgeError(
            {
              code: "INVALID_RESPONSE",
              message: "Knowledge HTTP response was not valid UTF-8",
            },
            { cause },
          );
        } finally {
          reader.releaseLock();
        }
      }
      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        /* Non-JSON error bodies are normalized below without exposing upstream content. */
      }
      if (
        response.ok ||
        (isRecord(value) && value.version === 1 && value.ok === false)
      ) {
        if (value === undefined)
          throw new KnowledgeError({
            code: "INVALID_RESPONSE",
            message: "Knowledge HTTP response was not JSON",
          });
        return value as KnowledgeResponse; // The method-aware client performs full protocol validation.
      }
      const code =
        response.status === 401
          ? "UNAUTHENTICATED"
          : response.status === 403
            ? "PERMISSION_DENIED"
            : response.status === 429
              ? "RATE_LIMITED"
              : [408, 504].includes(response.status)
                ? "TIMEOUT"
                : [502, 503].includes(response.status)
                  ? "UNAVAILABLE"
                  : "TRANSPORT_ERROR";
      const retryAfter = response.headers.get("retry-after");
      const retryAfterMs =
        retryAfter === null
          ? undefined
          : /^\d+$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : Math.max(0, Date.parse(retryAfter) - Date.now());
      throw new KnowledgeError({
        code,
        message: `Knowledge HTTP request failed (${response.status})`,
        ...(retryAfterMs !== undefined && Number.isSafeInteger(retryAfterMs)
          ? { retryAfterMs }
          : {}),
      });
    },
  } satisfies KnowledgeTransport);
}
