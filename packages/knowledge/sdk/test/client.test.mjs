import test from "node:test";
import assert from "node:assert/strict";
import {
  createKnowledgeClient,
  KnowledgeError,
  KNOWLEDGE_METHODS,
  parseKnowledgeRequest,
  parseKnowledgeResponse,
} from "@mewvis/knowledge-sdk";
import {
  base,
  capabilities,
  document,
  summary,
  chunk,
  job,
  search,
  time,
  success,
  failure,
  copy,
} from "./fixtures.mjs";

const rejectsCode = (promise, code) =>
  assert.rejects(
    promise,
    (error) => error instanceof KnowledgeError && error.code === code,
  );
const scoped = { knowledgeBaseId: base.id };
const docId = { ...scoped, documentId: document.id };
const jobId = { ...scoped, jobId: job.id };
const searchInput = {
  knowledgeBaseIds: [base.id],
  query: "蓝鹭计划的档案在哪里？",
};

test("public client covers the v1 operations using the same in-process/bridge envelope", async () => {
  const cases = [
    [
      "service.describe",
      {},
      {
        protocolVersion: 1,
        serviceId: "service-a",
        backend: { kind: "sqlite", provider: "sqlite-vec" },
        capabilities,
      },
    ],
    [
      "service.probe",
      {},
      {
        status: "ready",
        checkedAt: time,
        checks: [{ name: "query", status: "ok" }],
      },
    ],
    ["bases.list", { limit: 2 }, { items: [base], nextCursor: "opaque-next" }],
    ["bases.get", scoped, base],
    ["bases.create", { name: base.name }, base],
    ["bases.update", { ...scoped, patch: { description: "资料库" } }, base],
    ["bases.delete", scoped, { ...job, kind: "delete-base" }],
    ["bases.reindex", scoped, { ...job, kind: "reindex" }],
    [
      "documents.list",
      { ...scoped, cursor: "opaque" },
      { items: [summary], nextCursor: null },
    ],
    ["documents.get", docId, document],
    [
      "documents.import",
      {
        ...scoped,
        documents: [
          {
            title: document.title,
            text: document.text,
            externalId: "star-chart",
          },
        ],
        duplicatePolicy: "replace",
      },
      job,
    ],
    [
      "documents.delete",
      { ...scoped, documentIds: [document.id] },
      { ...job, kind: "delete-documents" },
    ],
    [
      "documents.reindex",
      { ...scoped, documentIds: [document.id] },
      { ...job, kind: "reindex" },
    ],
    ["chunks.list", docId, { items: [chunk], nextCursor: null }],
    ["chunks.get", { ...docId, chunkId: chunk.id }, chunk],
    ["search", searchInput, search],
    ["jobs.list", scoped, { items: [job], nextCursor: null }],
    ["jobs.get", jobId, job],
    ["jobs.cancel", jobId, { ...job, state: "cancelling" }],
  ];
  assert.deepEqual(
    new Set(cases.map(([method]) => method)),
    new Set(KNOWLEDGE_METHODS),
  );
  const pending = [...cases];
  const client = createKnowledgeClient({
    version: 1,
    async request(request, context) {
      const [method, params, value] = pending.shift();
      assert.deepEqual(request, { version: 1, method, params });
      assert.ok(context.signal instanceof AbortSignal);
      assert.ok(Object.isFrozen(request.params));
      assert.deepEqual(parseKnowledgeRequest(request), request);
      return success(value);
    },
  });
  for (const [method, params, expected] of cases) {
    const [group, member] = method.split(".");
    const actual =
      method === "search"
        ? await client.search(params)
        : group === "service"
          ? await client.service[member]()
          : await client[group][member](params);
    assert.deepEqual(actual, expected);
    assert.ok(Object.isFrozen(actual));
  }
  assert.equal(pending.length, 0);
  assert.ok(Object.isFrozen(client.documents));
});

test("import returns acceptance; polling, cancellation and publication remain explicit", async () => {
  const calls = [];
  const client = createKnowledgeClient({
    version: 1,
    async request(request) {
      calls.push(request);
      if (request.method === "documents.import") return success(job);
      if (request.method === "jobs.get")
        return success({
          ...job,
          state: "succeeded",
          progress: { total: 1, processed: 1, failed: 0, skipped: 0 },
          result: {
            documents: [
              {
                documentId: document.id,
                externalId: "star-chart",
                status: "succeeded",
              },
            ],
          },
        });
      return success(search);
    },
  });
  const accepted = await client.documents.import(
    { ...scoped, documents: [{ title: document.title, text: document.text }] },
    { idempotencyKey: "import-1" },
  );
  assert.equal(accepted.state, "queued");
  assert.equal(
    calls.length,
    1,
    "acceptance does not trigger hidden polling or retries",
  );
  assert.equal(calls[0].idempotencyKey, "import-1");
  assert.equal(
    (await client.jobs.get({ ...scoped, jobId: accepted.id })).state,
    "succeeded",
  );
  const result = await client.search(searchInput);
  assert.equal(result.hits[0].text, document.text);
  assert.equal(result.hits[0].location.page, 2);
  assert.equal(
    result.hits[0].score.value,
    -2.78,
    "raw ranking values are preserved, never inverted or treated as probabilities",
  );
});

test("validation rejects unsafe/ambiguous requests before transport is called", async () => {
  let calls = 0;
  const client = createKnowledgeClient({
    version: 1,
    async request() {
      calls++;
      return success(search);
    },
  });
  const cycle = {};
  cycle.self = cycle;
  const inputs = [
    { query: "question" },
    { knowledgeBaseIds: [], query: "question" },
    { knowledgeBaseIds: [base.id, base.id], query: "question" },
    { ...searchInput, query: "  " },
    { ...searchInput, limit: 1.5 },
    { ...searchInput, applicationId: "another-app" },
    { ...searchInput, database: "other" },
    { ...searchInput, filter: { operator: "raw", sql: "SELECT 1" } },
    { ...searchInput, filter: { operator: "and", conditions: [] } },
    { ...searchInput, filter: { operator: "eq", field: "topic", value: NaN } },
    {
      ...searchInput,
      filter: { operator: "eq", field: "topic", value: undefined },
    },
    { ...searchInput, filter: cycle },
  ];
  for (const input of inputs)
    await rejectsCode(client.search(input), "INVALID_ARGUMENT");
  await rejectsCode(
    client.search(searchInput, { idempotencyKey: "read-key" }),
    "INVALID_ARGUMENT",
  );
  await rejectsCode(
    client.search(searchInput, { timeoutMs: 0 }),
    "INVALID_ARGUMENT",
  );
  await rejectsCode(
    client.search(searchInput, { signal: {} }),
    "INVALID_ARGUMENT",
  );
  await rejectsCode(
    client.documents.delete({ ...scoped, documentIds: [] }),
    "INVALID_ARGUMENT",
  );
  await rejectsCode(
    client.bases.update({ ...scoped, patch: {} }),
    "INVALID_ARGUMENT",
  );
  for (const metadata of [
    cycle,
    new Date(),
    { n: Infinity },
    { missing: undefined },
    { symbol: Symbol() },
    { map: new Map() },
    { array: new Array(2) },
  ])
    await rejectsCode(
      client.documents.import({
        ...scoped,
        documents: [{ title: "title", text: "text", metadata }],
      }),
      "INVALID_ARGUMENT",
    );
  let getterCalls = 0;
  const metadata = Object.defineProperty({}, "secret", {
    enumerable: true,
    get() {
      getterCalls++;
      return "secret";
    },
  });
  await rejectsCode(
    client.bases.create({ name: "base", metadata }),
    "INVALID_ARGUMENT",
  );
  assert.equal(getterCalls, 0);
  assert.equal(calls, 0);
});

test("duplicate policy and Unicode source ranges are checked without rewriting plain text", async () => {
  const calls = [];
  const client = createKnowledgeClient({
    version: 1,
    async request(request) {
      calls.push(request);
      return success(job);
    },
  });
  const input = {
    ...scoped,
    documents: [
      {
        title: "星图",
        text: "😀星图",
        locations: [{ start: 0, end: 3, location: { page: 1 } }],
      },
    ],
  };
  await client.documents.import(input);
  assert.equal(calls[0].params.documents[0].text, input.documents[0].text);
  await rejectsCode(
    client.documents.import({ ...input, duplicatePolicy: "replace" }),
    "INVALID_ARGUMENT",
  );
  await rejectsCode(
    client.documents.import({
      ...input,
      documents: [
        {
          ...input.documents[0],
          locations: [{ start: 0, end: 4, location: { page: 1 } }],
        },
      ],
    }),
    "INVALID_ARGUMENT",
  );
  await rejectsCode(
    client.documents.import({
      ...input,
      documents: [
        { title: "a", text: "a", externalId: "same" },
        { title: "b", text: "b", externalId: "same" },
      ],
    }),
    "INVALID_ARGUMENT",
  );
});

test("inputs and results are isolated snapshots; independent clients have no shared state", async () => {
  const input = {
    ...searchInput,
    knowledgeBaseIds: [base.id],
    filter: { operator: "eq", field: "topic", value: "stars" },
  };
  const payload = copy(search);
  let request;
  const client = createKnowledgeClient({
    version: 1,
    async request(value) {
      request = value;
      return success(payload);
    },
  });
  const promise = client.search(input);
  input.knowledgeBaseIds.push("other");
  input.filter.value = "changed";
  const result = await promise;
  assert.deepEqual(request.params.knowledgeBaseIds, [base.id]);
  assert.equal(request.params.filter.value, "stars");
  assert.ok(!Object.isFrozen(input));
  assert.notEqual(result.hits[0], payload.hits[0]);
  payload.hits[0].text = "changed";
  assert.equal(result.hits[0].text, document.text);
  const another = createKnowledgeClient({
    version: 1,
    request: async () =>
      success({ items: [{ ...base, id: "base-b" }], nextCursor: null }),
  });
  assert.equal((await another.bases.list()).items[0].id, "base-b");
});

test("well-formed responses must match the requested base/document/job and operation", async () => {
  for (const mutate of [
    (value) => {
      value.hits[0].knowledgeBaseId = "other";
    },
    (value) => {
      value.diagnostics.targets = [];
    },
    (value) => {
      value.diagnostics.targets.push(value.diagnostics.targets[0]);
    },
    (value) => {
      value.diagnostics.targets[0].knowledgeBaseId = "other";
    },
    (value) => {
      value.hits.push(value.hits[0]);
    },
    (value) => {
      value.hits[0].score.value = Infinity;
    },
    (value) => {
      value.diagnostics.warnings.push({
        code: "warning",
        message: "warning",
        knowledgeBaseId: "other",
      });
    },
  ]) {
    const value = copy(search);
    mutate(value);
    const client = createKnowledgeClient({
      version: 1,
      request: async () => success(value),
    });
    await rejectsCode(client.search(searchInput), "INVALID_RESPONSE");
  }
  const cases = [
    [(client) => client.bases.get(scoped), { ...base, id: "other" }],
    [(client) => client.documents.get(docId), { ...document, id: "other" }],
    [
      (client) => client.chunks.list(docId),
      { items: [{ ...chunk, documentId: "other" }], nextCursor: null },
    ],
    [(client) => client.chunks.get({ ...docId, chunkId: "other" }), chunk],
    [(client) => client.jobs.get({ ...scoped, jobId: "other" }), job],
    [
      (client) =>
        client.documents.import({
          ...scoped,
          documents: [{ title: "title", text: "text" }],
        }),
      { ...job, kind: "delete-base" },
    ],
    [
      (client) => client.documents.list({ ...scoped, limit: 1 }),
      { items: [summary, { ...summary, id: "doc-b" }], nextCursor: null },
    ],
  ];
  for (const [invoke, value] of cases)
    await rejectsCode(
      invoke(
        createKnowledgeClient({
          version: 1,
          request: async () => success(value),
        }),
      ),
      "INVALID_RESPONSE",
    );
});

test("partial search requires opt-in and retains failed-target diagnostics", async () => {
  const value = copy(search);
  value.diagnostics.status = "partial";
  value.diagnostics.targets.push({
    knowledgeBaseId: "offline",
    status: "error",
    error: { code: "UNAVAILABLE", message: "offline" },
  });
  const client = createKnowledgeClient({
    version: 1,
    request: async () => success(value),
  });
  const input = { ...searchInput, knowledgeBaseIds: [base.id, "offline"] };
  await rejectsCode(client.search(input), "INVALID_RESPONSE");
  assert.equal(
    (await client.search({ ...input, allowPartial: true })).diagnostics
      .targets[1].error.code,
    "UNAVAILABLE",
  );
  value.hits.push({
    ...value.hits[0],
    id: "offline-hit",
    knowledgeBaseId: "offline",
  });
  await rejectsCode(
    client.search({ ...input, allowPartial: true }),
    "INVALID_RESPONSE",
  );
});

test("no results, service errors, invalid responses and transport failures remain distinct", async () => {
  const empty = copy(search);
  empty.hits = [];
  assert.equal(
    (
      await createKnowledgeClient({
        version: 1,
        request: async () => success(empty),
      }).search(searchInput)
    ).hits.length,
    0,
  );
  let calls = 0;
  const denied = createKnowledgeClient({
    version: 1,
    async request() {
      calls++;
      return { ...failure("PERMISSION_DENIED"), requestId: "trace-1" };
    },
  });
  await assert.rejects(
    denied.search(searchInput),
    (error) =>
      error.code === "PERMISSION_DENIED" && error.requestId === "trace-1",
  );
  assert.equal(calls, 1);
  await rejectsCode(
    createKnowledgeClient({
      version: 1,
      request: async () => {
        throw new Error("upstream private body");
      },
    }).search(searchInput),
    "TRANSPORT_ERROR",
  );
  for (const response of [
    null,
    { ok: true, value: search },
    { version: 2, ok: true, value: search },
    { ...success(search), error: { code: "NOT_FOUND", message: "bad" } },
    failure("UNKNOWN_CODE"),
    success({}),
  ])
    await rejectsCode(
      createKnowledgeClient({
        version: 1,
        request: async () => response,
      }).search(searchInput),
      "INVALID_RESPONSE",
    );
  const unsupported = createKnowledgeClient({
    version: 1,
    request: async () => failure("NOT_SUPPORTED"),
  });
  await rejectsCode(unsupported.bases.create({ name: "new" }), "NOT_SUPPORTED");
});

test("deadlines and AbortSignal stop waiting even when a transport ignores cancellation", async () => {
  let calls = 0;
  let signal;
  const client = createKnowledgeClient({
    version: 1,
    request: (_request, options) => {
      calls++;
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  const pre = new AbortController();
  pre.abort();
  await rejectsCode(
    client.search(searchInput, { signal: pre.signal }),
    "ABORTED",
  );
  assert.equal(calls, 0);
  await rejectsCode(client.search(searchInput, { timeoutMs: 10 }), "TIMEOUT");
  assert.ok(signal.aborted);
  const controller = new AbortController();
  const pending = client.documents.import(
    { ...scoped, documents: [{ title: "title", text: "text" }] },
    { signal: controller.signal },
  );
  await Promise.resolve();
  controller.abort();
  await rejectsCode(pending, "ABORTED");
  assert.equal(
    calls,
    2,
    "cancelling a wait never emits jobs.cancel or retries a write",
  );
});

test("result evolution accepts additive fields and unknown advertised method names", () => {
  const result = parseKnowledgeResponse(
    "service.describe",
    success({
      protocolVersion: 1,
      serviceId: "service-a",
      backend: { kind: "remote", provider: "future" },
      capabilities: {
        ...capabilities,
        methods: [...capabilities.methods, "future.operation"],
      },
      futureField: true,
    }),
  );
  assert.equal(result.value.futureField, true);
  assert.equal(result.value.capabilities.methods.at(-1), "future.operation");
  assert.throws(
    () =>
      parseKnowledgeRequest({
        version: 1,
        method: "future.operation",
        params: {},
      }),
    (error) => error.code === "INVALID_ARGUMENT",
  );
});

test("additive fields cannot bypass request scope validation", async () => {
  const client = (value) =>
    createKnowledgeClient({ version: 1, request: async () => success(value) });
  await rejectsCode(
    client({
      ...document,
      id: "other",
      knowledgeBaseId: "other",
      items: [],
    }).documents.get(docId),
    "INVALID_RESPONSE",
  );
  await rejectsCode(
    client({ ...job, knowledgeBaseId: "other", items: [] }).jobs.get(jobId),
    "INVALID_RESPONSE",
  );
  const value = { ...job, items: [{ future: true }] };
  assert.deepEqual(await client(value).jobs.get(jobId), value);
});

test("nested import location fields are strict and malformed job state is rejected", async () => {
  let calls = 0;
  const client = createKnowledgeClient({
    version: 1,
    async request() {
      calls++;
      return success(job);
    },
  });
  await rejectsCode(
    client.documents.import({
      ...scoped,
      documents: [
        {
          title: "title",
          text: "text",
          locations: [
            { start: 0, end: 1, location: { page: 1, applicationId: "other" } },
          ],
        },
      ],
    }),
    "INVALID_ARGUMENT",
  );
  assert.equal(calls, 0);
  for (const value of [
    { ...job, state: "failed" },
    { ...job, state: "succeeded" },
    { ...job, progress: { total: 1, processed: 2, failed: 0, skipped: 0 } },
    { ...job, progress: { total: 1, processed: 0, failed: 1, skipped: 0 } },
    { ...job, createdAt: "2026-02-30T00:00:00.000Z" },
  ])
    await rejectsCode(
      createKnowledgeClient({
        version: 1,
        request: async () => success(value),
      }).jobs.get(jobId),
      "INVALID_RESPONSE",
    );
});
