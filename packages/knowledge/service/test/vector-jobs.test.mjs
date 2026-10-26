import test from "node:test";
import assert from "node:assert/strict";
import { KnowledgeError, createKnowledgeClient } from "@mewvis/knowledge-sdk";
import {
  fixture,
  importText,
  waitJob,
  rejectsCode,
  deferred,
} from "./helpers.mjs";

function provider(override = {}) {
  return {
    signature: "test-vector-space-v1",
    dimensions: 3,
    async embed(documents, context) {
      return documents.map((document) =>
        context.purpose === "query"
          ? [1, 0, 0]
          : document.text.includes("target")
            ? [0.8, 0.6, 0]
            : document.text.includes("irrelevant")
              ? [-1, 0, 0]
              : [1, 0, 0],
      );
    },
    ...override,
  };
}

test("vector search scopes before ranking, applies metadata first, and hybrid search uses RRF", async (t) => {
  const { service } = await fixture(t, { embedding: provider() });
  const base = await service.bases.create({ name: "target" }),
    other = await service.bases.create({ name: "other" });
  const imported = await importText(service, base, [
    { title: "target", text: "target archive", metadata: { category: "keep" } },
    { title: "closer", text: "closer archive", metadata: { category: "drop" } },
    {
      title: "irrelevant",
      text: "irrelevant words",
      metadata: { category: "drop" },
    },
  ]);
  await importText(
    service,
    other,
    Array.from({ length: 60 }, (_, i) => ({
      title: `noise-${i}`,
      text: "closer archive",
    })),
  );
  const result = await service.search({
    knowledgeBaseIds: [base.id],
    query: "unrelated phrasing",
    mode: "vector",
    limit: 1,
    filter: { field: "category", operator: "eq", value: "keep" },
  });
  assert.equal(result.hits.length, 1);
  assert.equal(
    result.hits[0].documentId,
    imported.result.documents[0].documentId,
  );
  assert.ok(Math.abs(result.hits[0].score.value - 0.8) < 0.001);
  assert.equal(result.hits[0].score.kind, "similarity");
  const hybrid = await service.search({
    knowledgeBaseIds: [base.id],
    query: "archive",
    mode: "hybrid",
  });
  assert.ok(hybrid.hits.length > 0);
  assert.equal(hybrid.hits[0].score.kind, "rank");
  assert.equal(
    new Set(hybrid.hits.map((hit) => hit.id)).size,
    hybrid.hits.length,
  );
  assert.ok(hybrid.hits.every((hit) => hit.knowledgeBaseId === base.id));
  assert.equal((await service.service.probe()).status, "ready");
});

test("auto reports embedding outages while explicit vector/hybrid requests fail visibly", async (t) => {
  let offline = false;
  const embedding = provider({
    async embed(documents, context) {
      if (context.purpose === "query" && offline)
        throw new KnowledgeError({
          code: "UNAVAILABLE",
          message: "fixture offline",
        });
      return documents.map(() => [1, 0, 0]);
    },
  });
  const { service } = await fixture(t, { embedding });
  const base = await service.bases.create({ name: "base" });
  await importText(service, base, [
    { title: "notes", text: "图书馆保存着古老的秘密。" },
  ]);
  offline = true;
  const result = await service.search({
    knowledgeBaseIds: [base.id],
    query: "图书馆有什么秘密？",
  });
  assert.ok(result.hits.length > 0);
  assert.equal(result.diagnostics.warnings[0].code, "EMBEDDING_UNAVAILABLE");
  await rejectsCode(
    service.search({
      knowledgeBaseIds: [base.id],
      query: "question",
      mode: "vector",
    }),
    "UNAVAILABLE",
  );
  await rejectsCode(
    service.search({
      knowledgeBaseIds: [base.id],
      query: "question",
      mode: "hybrid",
    }),
    "UNAVAILABLE",
  );
  assert.equal((await service.service.probe()).status, "degraded");
});

test("replacement failure leaves the original document and index published", async (t) => {
  const entered = deferred(),
    release = deferred();
  const embedding = provider({
    async embed(documents, context) {
      if (
        context.purpose === "document" &&
        documents.some((document) => document.text.includes("replacement"))
      ) {
        entered.resolve();
        await release.promise;
        throw new KnowledgeError({
          code: "UNAVAILABLE",
          message: "fixture replacement failed",
        });
      }
      return documents.map(() => [1, 0, 0]);
    },
  });
  const { service } = await fixture(t, { embedding });
  const base = await service.bases.create({ name: "base" });
  const original = await importText(service, base, [
    { title: "old", text: "original archive", externalId: "same" },
  ]);
  const before = await service.search({
    knowledgeBaseIds: [base.id],
    query: "archive",
    mode: "keyword",
  });
  const replacement = await service.documents.import({
    knowledgeBaseId: base.id,
    duplicatePolicy: "replace",
    documents: [
      { title: "new", text: "replacement archive", externalId: "same" },
    ],
  });
  await entered.promise;
  assert.equal(
    (
      await service.jobs.get({
        knowledgeBaseId: base.id,
        jobId: replacement.id,
      })
    ).state,
    "running",
  );
  assert.equal(
    (
      await service.search({
        knowledgeBaseIds: [base.id],
        query: "archive",
        mode: "keyword",
      })
    ).hits[0].text,
    "original archive",
  );
  release.resolve();
  const failed = await waitJob(service, replacement);
  assert.equal(failed.state, "failed");
  assert.equal(failed.error.code, "UNAVAILABLE");
  const after = await service.search({
    knowledgeBaseIds: [base.id],
    query: "archive",
    mode: "keyword",
  });
  assert.equal(
    after.diagnostics.targets[0].indexRevision,
    before.diagnostics.targets[0].indexRevision,
  );
  assert.equal(
    (
      await service.documents.get({
        knowledgeBaseId: base.id,
        documentId: original.result.documents[0].documentId,
      })
    ).text,
    "original archive",
  );
});

test("full reindex is atomic across documents; partial imports publish successful documents only", async (t) => {
  let failing = false;
  const embedding = provider({
    async embed(documents) {
      if (
        failing &&
        documents.some((document) => document.text.includes("broken"))
      )
        throw new KnowledgeError({
          code: "UNAVAILABLE",
          message: "fixture failed",
        });
      return documents.map(() => [1, 0, 0]);
    },
  });
  const { service } = await fixture(t, { embedding });
  const base = await service.bases.create({ name: "base" });
  await importText(service, base, [
    { title: "good", text: "good archive" },
    { title: "broken", text: "broken archive" },
  ]);
  const before = await service.search({
    knowledgeBaseIds: [base.id],
    query: "archive",
    mode: "keyword",
  });
  failing = true;
  const reindex = await waitJob(
    service,
    await service.bases.reindex({ knowledgeBaseId: base.id }),
  );
  assert.equal(reindex.state, "failed");
  assert.deepEqual(
    (
      await service.search({
        knowledgeBaseIds: [base.id],
        query: "archive",
        mode: "keyword",
      })
    ).hits,
    before.hits,
  );
  const mixed = await waitJob(
    service,
    await service.documents.import({
      knowledgeBaseId: base.id,
      documents: [
        { title: "new good", text: "good new material" },
        { title: "new broken", text: "broken new material" },
      ],
    }),
  );
  assert.equal(mixed.state, "partially_succeeded");
  assert.deepEqual(mixed.progress, {
    total: 2,
    processed: 2,
    failed: 1,
    skipped: 0,
  });
  assert.equal(
    (await service.documents.list({ knowledgeBaseId: base.id })).items.length,
    3,
  );
});

test("queued/running cancellation never publishes staged data, even with an uncooperative embedder", async (t) => {
  const entered = deferred();
  const { service } = await fixture(t, {
    embedding: provider({
      embed: async () => {
        entered.resolve();
        return new Promise(() => {});
      },
    }),
  });
  const base = await service.bases.create({ name: "base" });
  const first = await service.documents.import({
    knowledgeBaseId: base.id,
    documents: [{ title: "first", text: "first archive" }],
  });
  await entered.promise;
  const queued = await service.documents.import({
    knowledgeBaseId: base.id,
    documents: [{ title: "second", text: "second archive" }],
  });
  assert.equal(
    (await service.jobs.cancel({ knowledgeBaseId: base.id, jobId: queued.id }))
      .state,
    "cancelled",
  );
  const cancelling = await service.jobs.cancel({
    knowledgeBaseId: base.id,
    jobId: first.id,
  });
  assert.equal(cancelling.state, "cancelling");
  assert.equal((await waitJob(service, first)).state, "cancelled");
  assert.equal(
    (await service.documents.list({ knowledgeBaseId: base.id })).items.length,
    0,
  );
});

test("service shutdown resumes accepted work after restart without replaying completed imports", async (t) => {
  const entered = deferred();
  const f = await fixture(t, {
    embedding: provider({
      embed: async () => {
        entered.resolve();
        return new Promise(() => {});
      },
    }),
  });
  const base = await f.service.bases.create({ name: "base" });
  const accepted = await f.service.documents.import(
    {
      knowledgeBaseId: base.id,
      documents: [
        { title: "resume", text: "resume archive", externalId: "resume" },
      ],
    },
    { idempotencyKey: "resume" },
  );
  await entered.promise;
  await f.service.close();
  const service = await f.reopen({ embedding: provider() });
  const finished = await waitJob(service, accepted);
  assert.equal(finished.state, "succeeded");
  assert.equal(
    (await service.documents.list({ knowledgeBaseId: base.id })).items.length,
    1,
  );
  assert.equal(
    (
      await service.documents.import(
        {
          knowledgeBaseId: base.id,
          documents: [
            { title: "resume", text: "resume archive", externalId: "resume" },
          ],
        },
        { idempotencyKey: "resume" },
      )
    ).id,
    accepted.id,
  );
});

test("embedding space changes require an atomic full reindex and never compare incompatible vectors", async (t) => {
  const f = await fixture(t, { embedding: provider() });
  const base = await f.service.bases.create({ name: "base" });
  const imported = await importText(f.service, base, [
    { title: "old", text: "target archive" },
  ]);
  const service = await f.reopen({
    embedding: provider({
      signature: "other-space",
      dimensions: 2,
      embed: async (documents) => documents.map(() => [1, 0]),
    }),
  });
  assert.equal(
    (await service.bases.get({ knowledgeBaseId: base.id })).state,
    "degraded",
  );
  await rejectsCode(
    service.search({
      knowledgeBaseIds: [base.id],
      query: "question",
      mode: "vector",
    }),
    "NOT_READY",
  );
  const result = await service.search({
    knowledgeBaseIds: [base.id],
    query: "archive",
  });
  assert.equal(
    result.diagnostics.warnings[0].code,
    "INDEX_CONFIGURATION_CHANGED",
  );
  await rejectsCode(
    service.documents.import({
      knowledgeBaseId: base.id,
      documents: [{ title: "new", text: "new archive" }],
    }),
    "NOT_READY",
  );
  await rejectsCode(
    service.documents.reindex({
      knowledgeBaseId: base.id,
      documentIds: [imported.result.documents[0].documentId],
    }),
    "NOT_READY",
  );
  assert.equal(
    (
      await waitJob(
        service,
        await service.bases.reindex({ knowledgeBaseId: base.id }),
      )
    ).state,
    "succeeded",
  );
  assert.equal(
    (await service.bases.get({ knowledgeBaseId: base.id })).state,
    "ready",
  );
  assert.equal(
    (
      await service.search({
        knowledgeBaseIds: [base.id],
        query: "question",
        mode: "vector",
      })
    ).hits[0].documentId,
    imported.result.documents[0].documentId,
  );
});

test("vector scope budgets fail explicitly and auto mode reports keyword fallback", async (t) => {
  const { service } = await fixture(t, {
    embedding: provider(),
    limits: { maxVectorSearchChunks: 1 },
  });
  const base = await service.bases.create({ name: "base" });
  await importText(service, base, [
    { title: "a", text: "archive a" },
    { title: "b", text: "archive b" },
  ]);
  await rejectsCode(
    service.search({
      knowledgeBaseIds: [base.id],
      query: "archive",
      mode: "vector",
    }),
    "INVALID_ARGUMENT",
  );
  const result = await service.search({
    knowledgeBaseIds: [base.id],
    query: "archive",
  });
  assert.ok(result.hits.length > 0);
  assert.equal(
    result.diagnostics.warnings[0].code,
    "VECTOR_RETRIEVAL_UNAVAILABLE",
  );
});

test("invalid vectors cannot corrupt an existing index and unchanged replacements reuse published data", async (t) => {
  let calls = 0,
    invalid = false;
  const { service } = await fixture(t, {
    embedding: provider({
      async embed(documents) {
        calls++;
        return documents.map(() => (invalid ? [0, 0, 0] : [1, 0, 0]));
      },
    }),
  });
  const base = await service.bases.create({ name: "base" });
  const input = [{ title: "a", externalId: "a", text: "archive" }];
  await importText(service, base, input);
  const count = calls;
  const skipped = await importText(service, base, input, {
    duplicatePolicy: "replace",
  });
  assert.equal(skipped.progress.skipped, 1);
  assert.equal(calls, count);
  invalid = true;
  const failed = await waitJob(
    service,
    await service.documents.import({
      knowledgeBaseId: base.id,
      duplicatePolicy: "replace",
      documents: [{ title: "a", externalId: "a", text: "changed archive" }],
    }),
  );
  assert.equal(failed.state, "failed");
  assert.equal(failed.error.code, "INVALID_RESPONSE");
  assert.equal(
    (
      await service.search({
        knowledgeBaseIds: [base.id],
        query: "archive",
        mode: "keyword",
      })
    ).hits[0].text,
    "archive",
  );
});

test("explicit cancellation is preserved when shutdown races with a running task", async (t) => {
  const entered = deferred();
  const f = await fixture(t, {
    embedding: provider({
      embed: async () => {
        entered.resolve();
        return new Promise(() => {});
      },
    }),
  });
  const base = await f.service.bases.create({ name: "base" });
  const receipt = await f.service.documents.import({
    knowledgeBaseId: base.id,
    documents: [{ title: "cancel", text: "cancel archive" }],
  });
  await entered.promise;
  await f.service.jobs.cancel({ knowledgeBaseId: base.id, jobId: receipt.id });
  await f.service.close();
  const service = await f.reopen({ embedding: provider() });
  assert.equal(
    (await service.jobs.get({ knowledgeBaseId: base.id, jobId: receipt.id }))
      .state,
    "cancelled",
  );
  assert.equal(
    (await service.documents.list({ knowledgeBaseId: base.id })).items.length,
    0,
  );
});

test("closing a service aborts active queries before releasing SQLite", async (t) => {
  const entered = deferred();
  let block = false;
  const f = await fixture(t, {
    embedding: provider({
      async embed(documents, context) {
        if (block && context.purpose === "query") {
          entered.resolve();
          return new Promise(() => {});
        }
        return documents.map(() => [1, 0, 0]);
      },
    }),
  });
  const base = await f.service.bases.create({ name: "base" });
  await importText(f.service, base, [{ title: "archive", text: "archive" }]);
  block = true;
  const cancelled = rejectsCode(
    f.service.search({
      knowledgeBaseIds: [base.id],
      query: "archive",
      mode: "vector",
    }),
    "ABORTED",
  );
  await entered.promise;
  await f.service.close();
  await cancelled;
});
