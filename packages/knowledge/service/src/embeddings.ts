import type { KnowledgeEmbeddingConfiguration } from "@mewvis/knowledge-sdk/configuration";
import { KnowledgeError } from "@mewvis/knowledge-sdk";
import type {
  KnowledgeEmbeddingProvider,
  KnowledgeServiceOptions,
} from "./types.js";
import { checkSignal, fail, hash, positive } from "./util.js";

export function normalized(
  vector: readonly number[],
  expected?: number,
): Float32Array {
  if (
    !Array.isArray(vector) ||
    vector.length === 0 ||
    vector.length > 65_536 ||
    (expected !== undefined && vector.length !== expected) ||
    vector.some((value) => typeof value !== "number" || !Number.isFinite(value))
  )
    fail("INVALID_RESPONSE", "Embedding dimensions or values are invalid");
  let maximum = 0;
  for (const n of vector) maximum = Math.max(maximum, Math.abs(n));
  if (maximum === 0) fail("INVALID_RESPONSE", "Embedding vector is zero");
  let squares = 0;
  for (const n of vector) squares += (n / maximum) ** 2;
  const denominator = Math.sqrt(squares);
  return Float32Array.from(vector, (n) => n / maximum / denominator);
}
export function vectorBytes(vector: Float32Array): Uint8Array {
  const buffer = Buffer.alloc(vector.length * 4);
  vector.forEach((value, i) => buffer.writeFloatLE(value, i * 4));
  return buffer;
}
export function cosine(query: Float32Array, blob: Uint8Array): number {
  if (blob.byteLength !== query.length * 4)
    fail("NOT_READY", "Stored vector dimensions do not match the query");
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  let dot = 0;
  for (let i = 0; i < query.length; i++)
    dot += query[i]! * view.getFloat32(i * 4, true);
  return Math.max(-1, Math.min(1, dot));
}
/** A cancelled worker can stop waiting even for an injected provider that ignores AbortSignal. */
export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(
        new KnowledgeError({
          code: "ABORTED",
          message: "Embedding operation aborted",
        }),
      );
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}
export function createEmbeddingProvider(
  config: KnowledgeEmbeddingConfiguration | undefined,
  options: KnowledgeServiceOptions,
): KnowledgeEmbeddingProvider | undefined {
  if (options.embedding) {
    if (config)
      fail(
        "INVALID_ARGUMENT",
        "Specify an embedding configuration or an injected provider, not both",
      );
    if (
      !options.embedding.signature?.trim() ||
      typeof options.embedding.embed !== "function"
    )
      fail("INVALID_ARGUMENT", "Invalid embedding provider");
    if (options.embedding.dimensions !== undefined)
      positive(options.embedding.dimensions, 1, 65_536);
    const provider = options.embedding;
    return Object.freeze({
      signature: provider.signature,
      ...(provider.dimensions !== undefined
        ? { dimensions: provider.dimensions }
        : {}),
      embed: provider.embed.bind(provider),
    });
  }
  if (!config) return undefined;
  if (!["openai-compatible", "ollama"].includes(config.provider))
    fail("NOT_SUPPORTED", "Embedding provider adapter is not implemented");
  if (config.credentialRef && !options.resolveCredential)
    fail(
      "INVALID_ARGUMENT",
      "Embedding credential reference requires a resolver",
    );
  const settings = config.options ?? {};
  if (
    Object.keys(settings).some(
      (key) =>
        ![
          "batchSize",
          "requestTimeoutMs",
          "queryTimeoutMs",
          "documentPrefix",
          "queryPrefix",
          "includeTitle",
          "sendInputType",
        ].includes(key),
    )
  )
    fail("INVALID_ARGUMENT", "Unsupported embedding provider option");
  for (const key of ["documentPrefix", "queryPrefix"])
    if (settings[key] !== undefined && typeof settings[key] !== "string")
      fail("INVALID_ARGUMENT", "Embedding prefixes must be strings");
  for (const key of ["includeTitle", "sendInputType"])
    if (settings[key] !== undefined && typeof settings[key] !== "boolean")
      fail("INVALID_ARGUMENT", "Invalid embedding formatting option");
  const batchSize = positive(
    settings.batchSize,
    config.provider === "ollama" ? 1 : 32,
    256,
  );
  const documentTimeout = positive(settings.requestTimeoutMs, 60_000, 600_000),
    queryTimeout = positive(settings.queryTimeoutMs, 10_000, 600_000);
  if (config.dimensions !== undefined) positive(config.dimensions, 1, 65_536);
  const endpoint = new URL(config.endpoint);
  // Keep the trimmed path outside URL: assigning "" to pathname restores "/".
  const path = endpoint.pathname.replace(/\/+$/, "");
  const ollama = config.provider === "ollama";
  endpoint.pathname = ollama
    ? path.endsWith("/api/embed")
      ? path
      : path.replace(/\/api$/, "") + "/api/embed"
    : path.endsWith("/embeddings")
      ? path
      : (path || "/v1") + "/embeddings";
  const fetcher = options.fetch ?? globalThis.fetch;
  const signature = hash({
    provider: config.provider,
    endpoint: endpoint.href,
    model: config.model,
    dimensions: config.dimensions ?? null,
    documentPrefix: settings.documentPrefix ?? "",
    queryPrefix: settings.queryPrefix ?? "",
    includeTitle: settings.includeTitle ?? false,
    sendInputType: settings.sendInputType ?? false,
  });
  return {
    signature,
    ...(config.dimensions ? { dimensions: config.dimensions } : {}),
    async embed(documents, context) {
      const vectors: number[][] = [];
      for (let offset = 0; offset < documents.length; offset += batchSize) {
        checkSignal(context.signal);
        const batch = documents.slice(offset, offset + batchSize);
        const prefix = String(
          context.purpose === "query"
            ? (settings.queryPrefix ?? "")
            : (settings.documentPrefix ?? ""),
        );
        const input = batch.map(
          (document) =>
            prefix +
            (context.purpose === "document" && settings.includeTitle
              ? `${document.title}\n\n`
              : "") +
            document.text,
        );
        const signal = AbortSignal.any([
          context.signal,
          AbortSignal.timeout(
            context.purpose === "query" ? queryTimeout : documentTimeout,
          ),
        ]);
        let token: string | undefined;
        try {
          token = config.credentialRef
            ? await abortable(
                Promise.resolve().then(() =>
                  options.resolveCredential!(config.credentialRef!),
                ),
                signal,
              )
            : undefined;
        } catch {
          checkSignal(context.signal);
          fail(
            signal.aborted ? "TIMEOUT" : "UNAUTHENTICATED",
            "Embedding credential resolution failed",
          );
        }
        if (
          token !== undefined &&
          (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token))
        )
          fail("UNAUTHENTICATED", "Embedding credential is unavailable");
        checkSignal(context.signal);
        let response: Response;
        try {
          response = await fetcher(endpoint.href, {
            method: "POST",
            redirect: "error",
            credentials: "omit",
            headers: {
              "content-type": "application/json",
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              model: config.model,
              input,
              ...(config.dimensions ? { dimensions: config.dimensions } : {}),
              ...(ollama ? { truncate: false } : {}),
              ...(settings.sendInputType
                ? { input_type: context.purpose }
                : {}),
            }),
            signal,
          });
        } catch {
          checkSignal(context.signal);
          fail(
            signal.aborted ? "TIMEOUT" : "UNAVAILABLE",
            "Embedding request failed",
          );
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          fail(
            response.status === 429
              ? "RATE_LIMITED"
              : [401, 403].includes(response.status)
                ? "UNAUTHENTICATED"
                : "UNAVAILABLE",
            `Embedding service returned HTTP ${response.status}`,
          );
        }
        let data: Record<string, unknown>;
        try {
          let size = 0,
            text = "";
          const reader = response.body?.getReader(),
            decoder = new TextDecoder("utf-8", { fatal: true });
          if (!reader) fail("INVALID_RESPONSE", "Embedding response is empty");
          try {
            for (;;) {
              const part = await reader.read();
              if (part.done) break;
              size += part.value.byteLength;
              if (size > 16 * 1024 * 1024)
                fail("INVALID_RESPONSE", "Embedding response exceeds 16 MiB");
              text += decoder.decode(part.value, { stream: true });
            }
            text += decoder.decode();
          } catch (error) {
            await reader.cancel().catch(() => {});
            throw error;
          } finally {
            reader.releaseLock();
          }
          data = JSON.parse(text) as Record<string, unknown>;
          if (!data || typeof data !== "object" || Array.isArray(data))
            fail("INVALID_RESPONSE", "Embedding response must be an object");
        } catch (error) {
          checkSignal(context.signal);
          if (error instanceof KnowledgeError) throw error;
          fail(
            signal.aborted ? "TIMEOUT" : "INVALID_RESPONSE",
            "Embedding response is invalid",
          );
        }
        let result: unknown;
        if (ollama) result = data.embeddings;
        else {
          if (!Array.isArray(data.data) || data.data.length !== batch.length)
            fail("INVALID_RESPONSE", "Embedding response count is invalid");
          const entries = data.data as {
            index?: unknown;
            embedding?: unknown;
          }[];
          if (
            entries.some(
              (entry) =>
                !entry ||
                !Number.isSafeInteger(entry.index) ||
                Number(entry.index) < 0 ||
                Number(entry.index) >= batch.length,
            ) ||
            new Set(entries.map((entry) => entry.index)).size !== entries.length
          )
            fail("INVALID_RESPONSE", "Embedding response indexes are invalid");
          result = entries
            .sort((a, b) => Number(a.index) - Number(b.index))
            .map((entry) => entry.embedding);
        }
        if (!Array.isArray(result) || result.length !== batch.length)
          fail("INVALID_RESPONSE", "Embedding response count is invalid");
        for (const vector of result) {
          normalized(vector as number[], config.dimensions);
          vectors.push(vector as number[]);
        }
      }
      return vectors;
    },
  };
}
