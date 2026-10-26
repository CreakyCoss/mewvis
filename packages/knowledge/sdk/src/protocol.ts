import {
  KNOWLEDGE_ERROR_CODES,
  KNOWLEDGE_PROTOCOL_VERSION,
  type KnowledgeInput,
  type KnowledgeMethod,
  type KnowledgeMethodMap,
  type KnowledgeMutationMethod,
  type KnowledgeOutput,
  type KnowledgeRequest,
  type KnowledgeResponse,
} from "./contracts.js";
import * as s from "./validation.js";
import {
  attachmentDefinitions,
  validateAttachmentResult,
} from "./attachment-protocol.js";

const opt = s.optional;
const ids = s.array(s.text, 1, true);
const scalar = s.union(s.nullable(s.string), s.boolean, s.finite);
const pageInput = { cursor: opt(s.text), limit: opt(s.positive) };
const baseId = { knowledgeBaseId: s.text };
const documentId = { ...baseId, documentId: s.text };
const jobId = { ...baseId, jobId: s.text };
const error = s.object(
  {
    code: s.enumeration(KNOWLEDGE_ERROR_CODES),
    message: s.text,
    retryAfterMs: opt(s.natural),
    details: opt(s.metadata),
  },
  true,
);
const source = s.object(
  { uri: opt(s.text), mediaType: opt(s.text), attachmentId: opt(s.text) },
  true,
);
const locationRule = (allowUnknown: boolean) =>
  s.object(
    {
      page: opt(s.positive),
      section: opt(s.array(s.text, 1)),
      lines: opt(
        s.refine(
          s.object({ start: s.positive, end: s.positive }, allowUnknown),
          (v) => v.end >= v.start,
        ),
      ),
      characters: opt(
        s.refine(
          s.object({ start: s.natural, end: s.natural }, allowUnknown),
          (v) => v.end > v.start,
        ),
      ),
    },
    allowUnknown,
  );
const location = locationRule(true);
const textLocation = s.refine(
  s.object({ start: s.natural, end: s.natural, location }, true),
  (v) => v.end > v.start,
);
const capabilities = s.object(
  {
    methods: s.array(s.text, 0, true),
    searchModes: s.array(
      s.enumeration(["keyword", "vector", "hybrid"]),
      0,
      true,
    ),
    filterOperators: s.array(
      s.enumeration([
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
      ]),
      0,
      true,
    ),
    idempotency: s.boolean,
    limits: opt(
      s.object(
        {
          maxSearchResults: opt(s.positive),
          maxPageSize: opt(s.positive),
          maxImportDocuments: opt(s.positive),
          maxDocumentCharacters: opt(s.positive),
          maxAttachmentBytes: opt(s.positive),
        },
        true,
      ),
    ),
  },
  true,
);
const base = s.object(
  {
    id: s.text,
    name: s.text,
    description: opt(s.string),
    state: s.enumeration([
      "empty",
      "indexing",
      "ready",
      "degraded",
      "unavailable",
    ]),
    metadata: opt(s.metadata),
    documentCount: opt(s.natural),
    chunkCount: opt(s.natural),
    createdAt: opt(s.timestamp),
    updatedAt: opt(s.timestamp),
    capabilities,
  },
  true,
);
const documentFields = {
  id: s.text,
  ...baseId,
  externalId: opt(s.text),
  title: s.text,
  state: s.enumeration(["pending", "indexing", "ready", "failed"]),
  revision: opt(s.text),
  source: opt(source),
  metadata: opt(s.metadata),
  chunkCount: opt(s.natural),
  createdAt: opt(s.timestamp),
  updatedAt: opt(s.timestamp),
  error: opt(error),
};
const summary = s.object(documentFields, true);
const validLocations = (v: any) => {
  if (!v.locations) return true;
  const length = Array.from(v.text).length;
  return v.locations.every((entry: any) => entry.end <= length);
};
const document = s.refine(
  s.object(
    {
      ...documentFields,
      text: s.string,
      locations: opt(s.array(textLocation)),
    },
    true,
  ),
  validLocations,
);
const textDocument = s.refine(
  s.object({
    externalId: opt(s.text),
    title: s.text,
    text: s.text,
    source: opt(
      s.object({
        uri: opt(s.text),
        mediaType: opt(s.text),
        attachmentId: opt(s.text),
      }),
    ),
    metadata: opt(s.metadata),
    locations: opt(
      s.array(
        s.refine(
          s.object({
            start: s.natural,
            end: s.natural,
            location: locationRule(false),
          }),
          (v) => v.end > v.start,
        ),
      ),
    ),
  }),
  validLocations,
);
const chunk = s.object(
  {
    id: s.text,
    ...documentId,
    documentRevision: opt(s.text),
    ordinal: s.natural,
    text: s.text,
    title: s.text,
    source: opt(source),
    location: opt(location),
    metadata: opt(s.metadata),
  },
  true,
);
const progress = s.refine(
  s.object(
    {
      total: s.nullable(s.natural),
      processed: s.natural,
      failed: s.natural,
      skipped: s.natural,
    },
    true,
  ),
  (v) =>
    v.processed >= v.failed + v.skipped &&
    (v.total === null || v.processed <= v.total),
);
const job = s.refine(
  s.object(
    {
      id: s.text,
      ...baseId,
      kind: s.enumeration([
        "import",
        "delete-documents",
        "delete-base",
        "reindex",
      ]),
      state: s.enumeration([
        "queued",
        "running",
        "cancelling",
        "succeeded",
        "partially_succeeded",
        "failed",
        "cancelled",
      ]),
      progress,
      createdAt: s.timestamp,
      updatedAt: s.timestamp,
      error: opt(error),
      result: opt(
        s.object(
          {
            documents: s.array(
              s.refine(
                s.object(
                  {
                    documentId: opt(s.text),
                    externalId: opt(s.text),
                    status: s.enumeration(["succeeded", "skipped", "failed"]),
                    error: opt(error),
                  },
                  true,
                ),
                (v) => (v.status === "failed") === (v.error !== undefined),
              ),
            ),
          },
          true,
        ),
      ),
    },
    true,
  ),
  (v) =>
    (v.state !== "failed" || v.error !== undefined) &&
    (v.state !== "succeeded" ||
      (v.progress.failed === 0 &&
        (v.progress.total === null ||
          v.progress.processed === v.progress.total))),
);
const page = (item: s.Rule) =>
  s.object({ items: s.array(item), nextCursor: s.nullable(s.text) }, true);
const filter: s.Rule = {
  check(value, path, code) {
    s.union(
      s.object({
        operator: s.enumeration(["eq", "ne"]),
        field: s.text,
        value: scalar,
      }),
      s.object({
        operator: s.enumeration(["gt", "gte", "lt", "lte"]),
        field: s.text,
        value: s.union(s.string, s.finite),
      }),
      s.object({
        operator: s.enumeration(["in", "notIn"]),
        field: s.text,
        values: s.array(scalar, 1),
      }),
      s.object({
        operator: s.literal("exists"),
        field: s.text,
        exists: s.boolean,
      }),
      s.object({
        operator: s.enumeration(["and", "or"]),
        conditions: s.array(filter, 1),
      }),
      s.object({ operator: s.literal("not"), condition: filter }),
    ).check(value, path, code);
  },
};
const hit = s.object(
  {
    id: s.text,
    ...baseId,
    documentId: opt(s.text),
    documentRevision: opt(s.text),
    chunkId: opt(s.text),
    title: s.text,
    text: s.text,
    source: opt(source),
    location: opt(location),
    metadata: opt(s.metadata),
    score: opt(
      s.object(
        {
          value: s.finite,
          kind: s.enumeration(["similarity", "distance", "relevance", "rank"]),
          higherIsBetter: s.boolean,
        },
        true,
      ),
    ),
  },
  true,
);
const target = s.refine(
  s.object(
    {
      ...baseId,
      status: s.enumeration(["ok", "error"]),
      indexRevision: opt(s.text),
      error: opt(error),
    },
    true,
  ),
  (v) => (v.status === "error") === (v.error !== undefined),
);
const search = s.object(
  {
    hits: s.array(hit),
    diagnostics: s.object(
      {
        status: s.enumeration(["complete", "partial"]),
        elapsedMs: s.refine(s.finite, (v) => v >= 0),
        targets: s.array(target, 1),
        warnings: s.array(
          s.object(
            { code: s.text, message: s.text, knowledgeBaseId: opt(s.text) },
            true,
          ),
        ),
      },
      true,
    ),
  },
  true,
);

const definitions = {
  "service.describe": {
    input: s.object({}),
    output: s.object(
      {
        protocolVersion: s.literal(1),
        serviceId: s.text,
        backend: s.object(
          {
            kind: s.enumeration(["sqlite", "mongodb", "remote"]),
            provider: s.text,
          },
          true,
        ),
        capabilities,
      },
      true,
    ),
  },
  "service.probe": {
    input: s.object({}),
    output: s.object(
      {
        status: s.enumeration(["ready", "degraded", "unavailable"]),
        checkedAt: s.timestamp,
        checks: s.array(
          s.object(
            {
              name: s.text,
              status: s.enumeration(["ok", "warning", "error"]),
              message: opt(s.string),
            },
            true,
          ),
          1,
        ),
      },
      true,
    ),
  },
  "bases.list": { input: s.object(pageInput), output: page(base) },
  "bases.get": { input: s.object(baseId), output: base },
  "bases.create": {
    input: s.object({
      name: s.text,
      description: opt(s.string),
      metadata: opt(s.metadata),
    }),
    output: base,
    mutation: true,
  },
  "bases.update": {
    input: s.object({
      ...baseId,
      patch: s.refine(
        s.object({
          name: opt(s.text),
          description: opt(s.string),
          metadata: opt(s.metadata),
        }),
        (v) => Object.keys(v).length > 0,
      ),
    }),
    output: base,
    mutation: true,
  },
  "bases.delete": { input: s.object(baseId), output: job, mutation: true },
  "bases.reindex": { input: s.object(baseId), output: job, mutation: true },
  "documents.list": {
    input: s.object({ ...baseId, ...pageInput }),
    output: page(summary),
  },
  "documents.get": { input: s.object(documentId), output: document },
  "documents.import": {
    input: s.refine(
      s.object({
        ...baseId,
        documents: s.array(textDocument, 1),
        duplicatePolicy: opt(s.enumeration(["reject", "skip", "replace"])),
      }),
      (v) =>
        (v.duplicatePolicy === undefined ||
          v.duplicatePolicy === "reject" ||
          v.documents.every((d: any) => d.externalId)) &&
        new Set(
          v.documents
            .filter((d: any) => d.externalId)
            .map((d: any) => d.externalId),
        ).size === v.documents.filter((d: any) => d.externalId).length,
    ),
    output: job,
    mutation: true,
  },
  "documents.delete": {
    input: s.object({ ...baseId, documentIds: ids }),
    output: job,
    mutation: true,
  },
  "documents.reindex": {
    input: s.object({ ...baseId, documentIds: ids }),
    output: job,
    mutation: true,
  },
  ...attachmentDefinitions,
  "chunks.list": {
    input: s.object({ ...documentId, ...pageInput }),
    output: page(chunk),
  },
  "chunks.get": {
    input: s.object({ ...documentId, chunkId: s.text }),
    output: chunk,
  },
  search: {
    input: s.object({
      knowledgeBaseIds: ids,
      query: s.text,
      limit: opt(s.positive),
      mode: opt(s.enumeration(["auto", "keyword", "vector", "hybrid"])),
      filter: opt(filter),
      allowPartial: opt(s.boolean),
    }),
    output: search,
  },
  "jobs.list": {
    input: s.object({ ...baseId, ...pageInput }),
    output: page(job),
  },
  "jobs.get": { input: s.object(jobId), output: job },
  "jobs.cancel": { input: s.object(jobId), output: job, mutation: true },
} satisfies Record<
  keyof KnowledgeMethodMap,
  { input: s.Rule; output: s.Rule; mutation?: boolean }
>;

export const KNOWLEDGE_METHODS: readonly KnowledgeMethod[] = Object.freeze(
  Object.keys(definitions) as KnowledgeMethod[],
);
export function isKnowledgeMethod(value: unknown): value is KnowledgeMethod {
  return typeof value === "string" && Object.hasOwn(definitions, value);
}
export function isKnowledgeMutation(
  method: unknown,
): method is KnowledgeMutationMethod {
  return isKnowledgeMethod(method) && "mutation" in definitions[method];
}

/** Service-side decoder and client-side request snapshot. Identity comes from the authenticated transport. */
export function parseKnowledgeRequest(value: unknown): KnowledgeRequest {
  const request = s.copyJson(value, "INVALID_ARGUMENT");
  s.object({
    version: s.literal(KNOWLEDGE_PROTOCOL_VERSION),
    method: s.text,
    params: s.metadata,
    idempotencyKey: opt(s.text),
  }).check(request, "request", "INVALID_ARGUMENT");
  if (!s.isRecord(request) || !isKnowledgeMethod(request.method))
    s.invalid("INVALID_ARGUMENT", "request.method");
  if (
    request.idempotencyKey !== undefined &&
    !isKnowledgeMutation(request.method)
  )
    s.invalid("INVALID_ARGUMENT", "request.idempotencyKey");
  definitions[request.method].input.check(
    request.params,
    "request.params",
    "INVALID_ARGUMENT",
  );
  return s.freeze(request) as KnowledgeRequest;
}

/** Response validation tolerates additive v1 result fields, never incompatible versions or malformed envelopes. */
export function parseKnowledgeResponse<M extends KnowledgeMethod>(
  method: M,
  value: unknown,
): KnowledgeResponse<M> {
  if (!isKnowledgeMethod(method)) s.invalid("INVALID_ARGUMENT", "method");
  const response = s.copyJson(value, "INVALID_RESPONSE");
  s.union(
    s.object({
      version: s.literal(1),
      ok: s.literal(true),
      value: definitions[method].output,
      requestId: opt(s.text),
    }),
    s.object({
      version: s.literal(1),
      ok: s.literal(false),
      error,
      requestId: opt(s.text),
    }),
  ).check(response, "response", "INVALID_RESPONSE");
  // Unknown capability method names are preserved for additive protocol evolution; clients call only known methods.
  return s.freeze(response) as KnowledgeResponse<M>;
}

/** Validate that a structurally valid response actually belongs to its request. */
export function validateKnowledgeResult<M extends KnowledgeMethod>(
  method: M,
  input: KnowledgeInput<M>,
  output: KnowledgeOutput<M>,
): void {
  const params = input as any;
  const result = output as any;
  const isList = method.endsWith(".list");
  const fail = () => s.invalid("INVALID_RESPONSE", "response.scope");
  if (method.startsWith("attachments.")) {
    validateAttachmentResult(method, input, output);
    return;
  }
  if (method === "search") {
    const requested = new Set(params.knowledgeBaseIds);
    const targets = result.diagnostics.targets;
    if (
      targets.length !== requested.size ||
      new Set(targets.map((t: any) => t.knowledgeBaseId)).size !==
        targets.length ||
      targets.some((t: any) => !requested.has(t.knowledgeBaseId))
    )
      fail();
    const failed = new Set(
      targets
        .filter((t: any) => t.status === "error")
        .map((t: any) => t.knowledgeBaseId),
    );
    if (
      failed.size > 0 !== (result.diagnostics.status === "partial") ||
      (failed.size > 0 && !params.allowPartial)
    )
      fail();
    if (
      result.hits.some(
        (h: any) =>
          !requested.has(h.knowledgeBaseId) || failed.has(h.knowledgeBaseId),
      ) ||
      new Set(result.hits.map((h: any) => h.id)).size !== result.hits.length ||
      (params.limit !== undefined && result.hits.length > params.limit) ||
      result.diagnostics.warnings.some(
        (w: any) =>
          w.knowledgeBaseId !== undefined && !requested.has(w.knowledgeBaseId),
      )
    )
      fail();
    return;
  }
  if (method === "bases.get" || method === "bases.update") {
    if (result.id !== params.knowledgeBaseId) fail();
  } else if (params.knowledgeBaseId !== undefined) {
    const records = isList ? result.items : [result];
    if (
      records.some(
        (r: any) =>
          r.knowledgeBaseId !== params.knowledgeBaseId ||
          (params.documentId !== undefined &&
            (method === "documents.get" ? r.id : r.documentId) !==
              params.documentId),
      )
    )
      fail();
    if (method === "chunks.get" && result.id !== params.chunkId) fail();
    if (
      (method === "jobs.get" || method === "jobs.cancel") &&
      result.id !== params.jobId
    )
      fail();
  }
  if (
    isList &&
    params.limit !== undefined &&
    result.items.length > params.limit
  )
    fail();
  const expectedKind: Partial<Record<KnowledgeMethod, string>> = {
    "bases.delete": "delete-base",
    "bases.reindex": "reindex",
    "documents.import": "import",
    "documents.delete": "delete-documents",
    "documents.reindex": "reindex",
  };
  if (
    expectedKind[method] !== undefined &&
    result.kind !== expectedKind[method]
  )
    fail();
}
