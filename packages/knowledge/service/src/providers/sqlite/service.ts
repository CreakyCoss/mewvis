import { randomUUID } from "node:crypto";
import {
  createKnowledgeClient,
  KNOWLEDGE_METHODS,
  isKnowledgeMethod,
  isKnowledgeMutation,
  parseKnowledgeRequest,
  parseKnowledgeResponse,
  validateKnowledgeResult,
  type KnowledgeCapabilities,
  type KnowledgeClient,
  type KnowledgeDocumentSummary,
  type KnowledgeJob,
  type KnowledgeMethod,
  type KnowledgeOutput,
  type KnowledgeProbeResult,
  type KnowledgeRequest,
  type KnowledgeResponse,
  type KnowledgeTransport,
} from "@mewvis/knowledge-sdk";
import type { SqliteKnowledgeServiceConfiguration } from "./index.js";
import type {
  KnowledgeAccess,
  KnowledgeService,
  KnowledgeServiceOptions,
  ServiceLimits,
} from "../../types.js";
import { SqliteKnowledgeStore, type BaseRow } from "./store.js";
import {
  createEmbeddingProvider,
  abortable,
  normalized,
} from "../../embeddings.js";
import { KnowledgeJobs } from "./jobs.js";
import { KnowledgeRetriever } from "./search.js";
import {
  canonical,
  checkSignal,
  fail,
  hash,
  json,
  now,
  positive,
  safeError,
} from "../../util.js";

interface AccessView {
  subjectId: string;
  ids: readonly string[] | undefined;
  methods: ReadonlySet<KnowledgeMethod>;
}
const filterOperators = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "exists",
  "and",
  "or",
  "not",
] as const;
const supportedMethods = [
  "service.describe",
  "service.probe",
  "bases.list",
  "bases.get",
  "bases.create",
  "bases.update",
  "bases.delete",
  "bases.reindex",
  "documents.list",
  "documents.get",
  "documents.import",
  "documents.delete",
  "documents.reindex",
  "chunks.list",
  "chunks.get",
  "search",
  "jobs.list",
  "jobs.get",
  "jobs.cancel",
] as const satisfies readonly KnowledgeMethod[];

/** Creates a trusted, in-process service. It never reads host configuration or registers network/UI endpoints. */
export async function createSqliteService(
  configuration: SqliteKnowledgeServiceConfiguration,
  options: KnowledgeServiceOptions = {},
): Promise<KnowledgeService> {
  const config = configuration;
  const embedding = createEmbeddingProvider(config.embedding, options);
  const maxCharacters = positive(options.chunking?.maxCharacters, 1200, 16_384);
  const overlapCharacters =
    options.chunking?.overlapCharacters ??
    Math.min(160, Math.floor(maxCharacters / 5));
  if (
    !Number.isSafeInteger(overlapCharacters) ||
    overlapCharacters < 0 ||
    overlapCharacters >= maxCharacters
  )
    fail("INVALID_ARGUMENT", "Chunk overlap must be smaller than chunk size");
  const limits: ServiceLimits = {
    maxImportDocuments: positive(options.limits?.maxImportDocuments, 100, 1000),
    maxDocumentCharacters: positive(
      options.limits?.maxDocumentCharacters,
      2_000_000,
      16_000_000,
    ),
    maxChunksPerBase: positive(options.limits?.maxChunksPerBase, 100_000),
    maxVectorSearchChunks: positive(
      options.limits?.maxVectorSearchChunks,
      20_000,
    ),
    maxVectorSearchBytes: positive(
      options.limits?.maxVectorSearchBytes,
      128 * 1024 * 1024,
    ),
  };
  const store = new SqliteKnowledgeStore(config.backend.directory);
  const jobs = new KnowledgeJobs(
    store,
    embedding,
    { maxCharacters, overlapCharacters },
    limits,
  );
  const retriever = new KnowledgeRetriever(store, embedding, limits);
  const shutdown = new AbortController();
  const inflight = new Set<Promise<KnowledgeResponse>>();
  let closing: Promise<void> | undefined;
  const heartbeat = setInterval(() => {
    try {
      store.heartbeat();
    } catch (error) {
      jobs.fault = safeError(error);
      shutdown.abort();
    }
  }, 5000);
  heartbeat.unref();

  const view = (access: KnowledgeAccess): AccessView => {
    if (
      !access ||
      typeof access.subjectId !== "string" ||
      !access.subjectId.trim() ||
      access.subjectId.length > 256 ||
      Object.keys(access).some(
        (key) => !["subjectId", "knowledgeBaseIds", "methods"].includes(key),
      )
    )
      fail("INVALID_ARGUMENT", "Invalid trusted knowledge access context");
    if (
      access.knowledgeBaseIds !== undefined &&
      (!Array.isArray(access.knowledgeBaseIds) ||
        access.knowledgeBaseIds.length > 2048 ||
        access.knowledgeBaseIds.some(
          (id) => typeof id !== "string" || !id.trim(),
        ))
    )
      fail("INVALID_ARGUMENT", "Invalid knowledge access scope");
    if (
      access.methods !== undefined &&
      (!Array.isArray(access.methods) ||
        access.methods.some((method) => !isKnowledgeMethod(method)))
    )
      fail("INVALID_ARGUMENT", "Invalid knowledge method grants");
    const ids =
      access.knowledgeBaseIds === undefined
        ? undefined
        : [...new Set(access.knowledgeBaseIds)].sort();
    const methods = new Set(access.methods ?? KNOWLEDGE_METHODS);
    if (ids !== undefined) methods.delete("bases.create");
    return { subjectId: access.subjectId, ids, methods };
  };
  const capabilities = (
    access: AccessView,
    base?: BaseRow,
  ): KnowledgeCapabilities => ({
    methods: supportedMethods.filter((method) => access.methods.has(method)),
    searchModes:
      embedding && (!base || base.embedding_signature === embedding.signature)
        ? ["keyword", "vector", "hybrid"]
        : ["keyword"],
    filterOperators,
    idempotency: true,
    limits: {
      maxSearchResults: 100,
      maxPageSize: 100,
      maxImportDocuments: limits.maxImportDocuments,
      maxDocumentCharacters: limits.maxDocumentCharacters,
    },
  });
  const baseValue = (row: BaseRow, access: AccessView) =>
    store.baseValue(row, capabilities(access, row), jobs.signature);
  const authorize = (request: KnowledgeRequest, access: AccessView) => {
    if (!access.methods.has(request.method))
      fail("PERMISSION_DENIED", "Knowledge operation is not granted");
    const params = request.params;
    const ids =
      "knowledgeBaseIds" in params
        ? params.knowledgeBaseIds
        : "knowledgeBaseId" in params
          ? [params.knowledgeBaseId]
          : [];
    if (access.ids !== undefined && ids.some((id) => !access.ids!.includes(id)))
      fail("PERMISSION_DENIED", "Knowledge base access is not granted");
  };
  const probe = async (signal: AbortSignal): Promise<KnowledgeProbeResult> => {
    const checks: KnowledgeProbeResult["checks"][number][] = [
      { name: "sqlite", status: "ok" },
      { name: "fts5", status: "ok" },
    ];
    store.one("SELECT 1 FROM kb_fts LIMIT 1");
    if (jobs.fault)
      checks.push({
        name: "worker",
        status: "error",
        message: "Knowledge worker is unavailable",
      });
    else checks.push({ name: "worker", status: "ok" });
    if (embedding) {
      try {
        const response = await abortable(
          embedding.embed(
            [{ title: "", text: "knowledge connectivity probe" }],
            { purpose: "query", signal },
          ),
          signal,
        );
        if (response.length !== 1)
          fail("INVALID_RESPONSE", "Invalid embedding probe response");
        normalized(response[0]!, embedding.dimensions);
        checks.push({ name: "embedding", status: "ok" });
      } catch (error) {
        checkSignal(signal);
        checks.push({
          name: "embedding",
          status: "error",
          message: safeError(error).message,
        });
      }
    }
    const mismatched = store.one(
      "SELECT 1 FROM kb_bases b WHERE EXISTS(SELECT 1 FROM kb_documents d WHERE d.base_id=b.id) AND embedding_signature IS NOT ? LIMIT 1",
      jobs.signature,
    );
    if (mismatched)
      checks.push({
        name: "index-configuration",
        status: "warning",
        message:
          "Some knowledge bases require reindexing for the current embedding configuration",
      });
    return {
      status: jobs.fault
        ? "unavailable"
        : checks.some((check) => check.status !== "ok")
          ? "degraded"
          : "ready",
      checkedAt: now(),
      checks,
    };
  };

  const dispatch = async (
    request: KnowledgeRequest,
    access: AccessView,
    signal: AbortSignal,
  ): Promise<KnowledgeOutput<KnowledgeMethod>> => {
    if (request.method === "service.describe")
      return {
        protocolVersion: 1,
        serviceId: store.serviceId,
        backend: { kind: "sqlite", provider: "sqlite-fts5-exact-vector" },
        capabilities: capabilities(access),
      };
    if (request.method === "service.probe") return probe(signal);
    if (request.method.startsWith("attachments."))
      fail(
        "NOT_SUPPORTED",
        "SQLite attachment operations are not implemented yet",
      );
    if (request.method === "search") {
      if (request.params.knowledgeBaseIds.length > 64)
        fail(
          "INVALID_ARGUMENT",
          "A search may select at most 64 knowledge bases",
        );
      return retriever.search(request.params, signal);
    }
    const work = (): KnowledgeOutput<KnowledgeMethod> => {
      const scope = {
        method: request.method,
        subject: access.subjectId,
        grants: access.ids ?? null,
        methods: [...access.methods].sort(),
        params: Object.fromEntries(
          Object.entries(request.params).filter(
            ([key]) => !["cursor", "limit"].includes(key),
          ),
        ),
      };
      switch (request.method) {
        case "bases.list": {
          const where =
            access.ids === undefined
              ? "1"
              : access.ids.length
                ? `id IN (${access.ids.map(() => "?").join(",")})`
                : "0";
          return store.page(
            "kb_bases",
            where,
            [...(access.ids ?? [])],
            request.params,
            scope,
            (row) => baseValue(row as unknown as BaseRow, access),
          );
        }
        case "bases.get":
          return baseValue(store.base(request.params.knowledgeBaseId), access);
        case "bases.create": {
          const stamp = now(),
            id = randomUUID(),
            input = request.params;
          store.run(
            "INSERT INTO kb_bases(id,name,description,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            id,
            input.name,
            input.description ?? null,
            JSON.stringify(input.metadata ?? {}),
            stamp,
            stamp,
          );
          return baseValue(store.base(id), access);
        }
        case "bases.update": {
          const old = store.base(request.params.knowledgeBaseId),
            patch = request.params.patch;
          store.run(
            "UPDATE kb_bases SET name=?,description=?,metadata_json=?,updated_at=? WHERE id=?",
            patch.name ?? old.name,
            patch.description ?? old.description,
            patch.metadata ? JSON.stringify(patch.metadata) : old.metadata_json,
            now(),
            old.id,
          );
          return baseValue(store.base(old.id), access);
        }
        case "bases.delete":
        case "bases.reindex": {
          const base = store.base(request.params.knowledgeBaseId),
            remove = request.method === "bases.delete";
          const total = remove
            ? 1
            : store.one<{ n: number }>(
                "SELECT COUNT(*) n FROM kb_documents WHERE base_id=?",
                base.id,
              )!.n;
          return store.enqueue(
            base.id,
            {
              operation: remove ? "delete-base" : "reindex",
              all: true,
              embeddingSignature: jobs.signature,
            },
            total,
          );
        }
        case "documents.list": {
          store.base(request.params.knowledgeBaseId);
          return store.page(
            "kb_documents",
            "base_id=?",
            [request.params.knowledgeBaseId],
            request.params,
            scope,
            (row) => json<KnowledgeDocumentSummary>(String(row.summary_json)),
          );
        }
        case "documents.get":
          return store.documentValue(
            store.document(
              request.params.knowledgeBaseId,
              request.params.documentId,
            ),
          );
        case "documents.import": {
          const input = request.params;
          if (
            input.documents.some(
              (document) => document.source?.attachmentId !== undefined,
            )
          )
            fail(
              "NOT_SUPPORTED",
              "SQLite attachment references are not implemented yet",
            );
          store.base(input.knowledgeBaseId);
          jobs.assertProfile(input.knowledgeBaseId);
          if (
            input.documents.length > limits.maxImportDocuments ||
            input.documents.some(
              (document) =>
                Array.from(document.text).length > limits.maxDocumentCharacters,
            )
          )
            fail(
              "INVALID_ARGUMENT",
              "Document import exceeds configured limits",
            );
          return store.enqueue(
            input.knowledgeBaseId,
            {
              operation: "import",
              documents: input.documents,
              duplicatePolicy: input.duplicatePolicy ?? "reject",
              embeddingSignature: jobs.signature,
            },
            input.documents.length,
          );
        }
        case "documents.delete":
        case "documents.reindex": {
          const input = request.params;
          store.base(input.knowledgeBaseId);
          if (input.documentIds.length > 1000)
            fail("INVALID_ARGUMENT", "Too many document targets");
          for (const id of input.documentIds)
            store.document(input.knowledgeBaseId, id);
          if (request.method === "documents.reindex")
            jobs.assertProfile(input.knowledgeBaseId);
          return store.enqueue(
            input.knowledgeBaseId,
            {
              operation:
                request.method === "documents.delete"
                  ? "delete-documents"
                  : "reindex",
              documentIds: input.documentIds,
              embeddingSignature: jobs.signature,
            },
            input.documentIds.length,
          );
        }
        case "chunks.list": {
          const doc = store.document(
            request.params.knowledgeBaseId,
            request.params.documentId,
          );
          return store.page(
            "kb_chunks",
            "base_id=? AND document_id=?",
            [doc.base_id, doc.id],
            request.params,
            {
              ...scope,
              revision: doc.revision,
              indexRevision: store.base(doc.base_id).generation,
            },
            (row) =>
              store.chunkValue({
                data_json: String(row.data_json),
                summary_json: doc.summary_json,
              }),
          );
        }
        case "chunks.get": {
          const doc = store.document(
            request.params.knowledgeBaseId,
            request.params.documentId,
          );
          const row =
            store.one<{ data_json: string }>(
              "SELECT data_json FROM kb_chunks WHERE id=? AND base_id=? AND document_id=?",
              request.params.chunkId,
              doc.base_id,
              doc.id,
            ) ?? fail("NOT_FOUND", "Knowledge chunk not found");
          return store.chunkValue({ ...row, summary_json: doc.summary_json });
        }
        case "jobs.list":
          return store.page(
            "kb_jobs",
            "base_id=?",
            [request.params.knowledgeBaseId],
            request.params,
            scope,
            (row) => json<KnowledgeJob>(String(row.job_json)),
          );
        case "jobs.get":
          return store.job(
            request.params.knowledgeBaseId,
            request.params.jobId,
          );
        case "jobs.cancel":
          return jobs.cancel(
            request.params.knowledgeBaseId,
            request.params.jobId,
          );
      }
      fail("NOT_SUPPORTED", "Knowledge operation is not implemented by SQLite");
    };
    const result = isKnowledgeMutation(request.method)
      ? store.receipt(
          access.subjectId,
          request.idempotencyKey,
          hash({ method: request.method, params: request.params }),
          work,
        )
      : work();
    if (
      request.method === "jobs.cancel" &&
      (result as KnowledgeJob).state === "cancelling"
    )
      jobs.interrupt((result as KnowledgeJob).id);
    if (isKnowledgeMutation(request.method)) jobs.wake();
    return result;
  };
  const createTransport = (context: KnowledgeAccess): KnowledgeTransport => {
    const access = view(context);
    return Object.freeze({
      version: 1,
      request(raw, callOptions) {
        const operation = (async (): Promise<KnowledgeResponse> => {
          const requestId = randomUUID();
          try {
            if (closing || shutdown.signal.aborted)
              fail("UNAVAILABLE", "Knowledge service is closed or unavailable");
            const request = parseKnowledgeRequest(raw);
            if (Buffer.byteLength(canonical(request)) > 16 * 1024 * 1024)
              fail("INVALID_ARGUMENT", "Knowledge request exceeds 16 MiB");
            const signal = callOptions?.signal
              ? AbortSignal.any([callOptions.signal, shutdown.signal])
              : shutdown.signal;
            checkSignal(signal);
            store.assertOwner();
            authorize(request, access);
            if (jobs.fault && request.method !== "service.probe")
              fail("UNAVAILABLE", "Knowledge worker is unavailable");
            const value = await dispatch(request, access, signal);
            const response = parseKnowledgeResponse(request.method, {
              version: 1,
              ok: true,
              value,
              requestId,
            });
            if (response.ok)
              validateKnowledgeResult(
                request.method,
                request.params,
                response.value,
              );
            return response;
          } catch (error) {
            return {
              version: 1,
              ok: false,
              error: safeError(error),
              requestId,
            };
          }
        })();
        inflight.add(operation);
        void operation.finally(() => inflight.delete(operation));
        return operation;
      },
    } satisfies KnowledgeTransport);
  };
  const transport = createTransport({ subjectId: "host" });
  const client: KnowledgeClient = createKnowledgeClient(transport);
  jobs.wake();
  return Object.freeze({
    ...client,
    transport,
    createTransport,
    close() {
      closing ??= (async () => {
        shutdown.abort();
        clearInterval(heartbeat);
        await jobs.stop();
        await Promise.allSettled([...inflight]);
        store.close();
      })();
      return closing;
    },
  });
}
