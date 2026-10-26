import {
  KNOWLEDGE_PROTOCOL_VERSION,
  type KnowledgeInput,
  type KnowledgeMethod,
  type KnowledgeMutationOptions,
  type KnowledgeOutput,
  type KnowledgeRequestOptions,
  type KnowledgeTransport,
} from "./contracts.js";
import type { KnowledgeClient, KnowledgeClientOptions } from "./index.js";
import { KnowledgeError } from "./errors.js";
import {
  parseKnowledgeRequest,
  parseKnowledgeResponse,
  validateKnowledgeResult,
} from "./protocol.js";
import { invalid, isRecord } from "./validation.js";

const validTimeout = (value: unknown) =>
  value === undefined ||
  (typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 2_147_483_647);
const optionsObject = (value: unknown): boolean => isRecord(value);

/** Pure client: no provider drivers, hidden persistence, retries, polling or global service instance. */
export function createTransportClient(
  transport: KnowledgeTransport,
  defaults: KnowledgeClientOptions = {},
): KnowledgeClient {
  if (
    !transport ||
    transport.version !== KNOWLEDGE_PROTOCOL_VERSION ||
    typeof transport.request !== "function"
  )
    invalid("INVALID_ARGUMENT", "transport");
  if (
    !optionsObject(defaults) ||
    Object.keys(defaults).some((key) => key !== "timeoutMs") ||
    !validTimeout(defaults.timeoutMs)
  )
    invalid("INVALID_ARGUMENT", "client.options");
  const defaultTimeout = defaults.timeoutMs;

  const call = async <M extends KnowledgeMethod>(
    method: M,
    input: KnowledgeInput<M>,
    options: KnowledgeMutationOptions = {},
  ): Promise<KnowledgeOutput<M>> => {
    if (
      !optionsObject(options) ||
      Object.keys(options).some(
        (key) => !["signal", "timeoutMs", "idempotencyKey"].includes(key),
      ) ||
      !validTimeout(options.timeoutMs)
    )
      invalid("INVALID_ARGUMENT", "request.options");
    if (
      options.signal !== undefined &&
      (!options.signal ||
        typeof options.signal.aborted !== "boolean" ||
        typeof options.signal.addEventListener !== "function" ||
        typeof options.signal.removeEventListener !== "function")
    )
      invalid("INVALID_ARGUMENT", "request.options.signal");
    const request = parseKnowledgeRequest({
      version: KNOWLEDGE_PROTOCOL_VERSION,
      method,
      params: input,
      ...(options.idempotencyKey !== undefined
        ? { idempotencyKey: options.idempotencyKey }
        : {}),
    });
    const controller = new AbortController();
    let timedOut = false;
    const cancellation = () =>
      new KnowledgeError({
        code: timedOut ? "TIMEOUT" : "ABORTED",
        message: timedOut
          ? "Knowledge request timed out; mutation outcome may be unknown"
          : "Knowledge request aborted; mutation outcome may be unknown",
      });
    if (options.signal?.aborted) throw cancellation();
    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timeoutMs = options.timeoutMs ?? defaultTimeout;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => {};
    try {
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(cancellation());
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      if (timeoutMs !== undefined)
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
      const operation = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw cancellation();
        return transport.request(request, { signal: controller.signal });
      });
      const response = parseKnowledgeResponse(
        method,
        await Promise.race([operation, aborted]),
      );
      if (!response.ok)
        throw new KnowledgeError(
          response.error,
          response.requestId ? { requestId: response.requestId } : undefined,
        );
      validateKnowledgeResult(
        method,
        request.params as KnowledgeInput<M>,
        response.value,
      );
      return response.value;
    } catch (cause) {
      if (controller.signal.aborted) throw cancellation();
      if (cause instanceof KnowledgeError) throw cause;
      throw new KnowledgeError(
        {
          code: "TRANSPORT_ERROR",
          message:
            "Knowledge transport failed; mutation outcome may be unknown",
        },
        { cause },
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      options.signal?.removeEventListener("abort", forwardAbort);
    }
  };

  return Object.freeze({
    service: Object.freeze({
      describe: (options?: KnowledgeRequestOptions) =>
        call("service.describe", {}, options),
      probe: (options?: KnowledgeRequestOptions) =>
        call("service.probe", {}, options),
    }),
    bases: Object.freeze({
      list: (input = {}, options?: KnowledgeRequestOptions) =>
        call("bases.list", input, options),
      get: (input, options) => call("bases.get", input, options),
      create: (input, options) => call("bases.create", input, options),
      update: (input, options) => call("bases.update", input, options),
      delete: (input, options) => call("bases.delete", input, options),
      reindex: (input, options) => call("bases.reindex", input, options),
    }),
    documents: Object.freeze({
      list: (input, options) => call("documents.list", input, options),
      get: (input, options) => call("documents.get", input, options),
      import: (input, options) => call("documents.import", input, options),
      delete: (input, options) => call("documents.delete", input, options),
      reindex: (input, options) => call("documents.reindex", input, options),
    }),
    chunks: Object.freeze({
      list: (input, options) => call("chunks.list", input, options),
      get: (input, options) => call("chunks.get", input, options),
    }),
    search: (input, options) => call("search", input, options),
    jobs: Object.freeze({
      list: (input, options) => call("jobs.list", input, options),
      get: (input, options) => call("jobs.get", input, options),
      cancel: (input, options) => call("jobs.cancel", input, options),
    }),
  } satisfies KnowledgeClient);
}
