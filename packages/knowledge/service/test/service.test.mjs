import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { createKnowledgeService } from "@mewvis/knowledge-service";
import {
  createKnowledgeClient,
  KNOWLEDGE_METHODS,
} from "@mewvis/knowledge-sdk";
import { fixture, importText, waitJob, rejectsCode } from "./helpers.mjs";

test("caller-owned SQLite service implements the text/index lifecycle and survives restart", async (t) => {
  const f = await fixture(t, {
    chunking: { maxCharacters: 18, overlapCharacters: 3 },
  });
  let service = f.service;
  const description = await service.service.describe();
  assert.deepEqual(
    description.capabilities.methods,
    KNOWLEDGE_METHODS.filter((method) => !method.startsWith("attachments.")),
  );
  assert.deepEqual(description.capabilities.searchModes, ["keyword"]);
  assert.equal((await service.service.probe()).status, "ready");
  let base = await service.bases.create({
    name: "资料",
    metadata: { category: "novel" },
  });
  base = await service.bases.update({
    knowledgeBaseId: base.id,
    patch: { description: "更新描述" },
  });
  assert.equal(base.description, "更新描述");
  assert.equal(base.state, "empty");
  assert.equal((await service.bases.list()).items.length, 1);
  const text =
    "😀序章\n蓝鹭计划的档案藏在北塔。\n图书馆保存着古老的秘密，守卫每天记录来访者的姓名。";
  const accepted = await service.documents.import({
    knowledgeBaseId: base.id,
    documents: [
      {
        externalId: "chapter-1",
        title: "第一章",
        text,
        source: { uri: "urn:novel:chapter-1" },
        metadata: { topic: "archive" },
        locations: [
          {
            start: 0,
            end: Array.from(text).length,
            location: { page: 3, section: ["序章"] },
          },
        ],
      },
    ],
  });
  assert.equal(accepted.state, "queued");
  const finished = await waitJob(service, accepted);
  assert.equal(finished.state, "succeeded");
  const id = finished.result.documents[0].documentId;
  const doc = await service.documents.get({
    knowledgeBaseId: base.id,
    documentId: id,
  });
  assert.equal(doc.text, text);
  assert.equal(doc.state, "ready");
  assert.equal(
    (await service.documents.list({ knowledgeBaseId: base.id })).items[0].id,
    id,
  );
  const chunks = await service.chunks.list({
    knowledgeBaseId: base.id,
    documentId: id,
  });
  assert.ok(chunks.items.length > 1);
  for (const chunk of chunks.items) {
    const range = chunk.location.characters;
    assert.equal(
      Array.from(text).slice(range.start, range.end).join(""),
      chunk.text,
    );
    assert.equal(chunk.location.page, 3);
    assert.equal(
      (
        await service.chunks.get({
          knowledgeBaseId: base.id,
          documentId: id,
          chunkId: chunk.id,
        })
      ).id,
      chunk.id,
    );
  }
  const found = await service.search({
    knowledgeBaseIds: [base.id],
    query: "图书馆保存了什么秘密？",
    mode: "keyword",
  });
  assert.ok(found.hits.some((hit) => hit.text.includes("图书馆")));
  assert.ok(
    found.hits.every(
      (hit) =>
        hit.source.uri === "urn:novel:chapter-1" && hit.location.page === 3,
    ),
  );
  assert.equal(found.hits[0].score.higherIsBetter, false);
  assert.equal(
    (await service.bases.get({ knowledgeBaseId: base.id })).state,
    "ready",
  );
  assert.equal(
    (await service.jobs.list({ knowledgeBaseId: base.id })).items.length,
    1,
  );
  assert.equal(
    (
      await service.jobs.cancel({
        knowledgeBaseId: base.id,
        jobId: accepted.id,
      })
    ).state,
    "succeeded",
  );
  assert.equal(
    (
      await waitJob(
        service,
        await service.documents.reindex({
          knowledgeBaseId: base.id,
          documentIds: [id],
        }),
      )
    ).state,
    "succeeded",
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
  service = await f.reopen();
  assert.equal(
    (await service.service.describe()).serviceId,
    description.serviceId,
  );
  assert.equal(
    (await service.search({ knowledgeBaseIds: [base.id], query: "图书馆" }))
      .hits[0].documentId,
    id,
  );
  const files = await readdir(f.directory);
  assert.ok(files.includes("knowledge.sqlite"));
  assert.ok(!files.includes("config.db"));
  assert.equal(
    (
      await waitJob(
        service,
        await service.documents.delete({
          knowledgeBaseId: base.id,
          documentIds: [id],
        }),
      )
    ).state,
    "succeeded",
  );
  assert.equal(
    (await service.search({ knowledgeBaseIds: [base.id], query: "图书馆" }))
      .hits.length,
    0,
  );
  await rejectsCode(
    service.documents.get({ knowledgeBaseId: base.id, documentId: id }),
    "NOT_FOUND",
  );
  const deletion = await waitJob(
    service,
    await service.bases.delete({ knowledgeBaseId: base.id }),
  );
  assert.equal(deletion.state, "succeeded");
  await rejectsCode(
    service.bases.get({ knowledgeBaseId: base.id }),
    "NOT_FOUND",
  );
  assert.equal(
    (await service.jobs.get({ knowledgeBaseId: base.id, jobId: deletion.id }))
      .state,
    "succeeded",
  );
});

test("Chinese questions and English BM25 rankings work without a vector service", async (t) => {
  const { service } = await fixture(t);
  const base = await service.bases.create({ name: "ranking" });
  await importText(service, base, [
    { title: "中文", text: "月亮下的图书馆保存着古老的秘密。" },
    { title: "good", text: "quasar ".repeat(12) + "observations" },
    { title: "weak", text: "quasar " + "ordinary ".repeat(90) },
    ...Array.from({ length: 8 }, (_, i) => ({
      title: `filler-${i}`,
      text: "unrelated observations ".repeat(30),
    })),
  ]);
  assert.equal(
    (
      await service.search({
        knowledgeBaseIds: [base.id],
        query: "图书馆保存了什么秘密？",
      })
    ).hits[0].title,
    "中文",
  );
  const result = await service.search({
    knowledgeBaseIds: [base.id],
    query: "quasar",
  });
  assert.equal(result.hits[0].title, "good");
  assert.ok(result.hits[0].score.value < result.hits[1].score.value);
  await rejectsCode(
    service.search({ knowledgeBaseIds: [base.id], query: "q", mode: "vector" }),
    "NOT_SUPPORTED",
  );
  assert.equal(
    (await service.search({ knowledgeBaseIds: [base.id], query: "zzzzzz" }))
      .hits.length,
    0,
  );
});

test("metadata filters preserve JSON types and are applied before scoped candidate limits", async (t) => {
  const { service } = await fixture(t, {
    chunking: { maxCharacters: 32, overlapCharacters: 0 },
  });
  const base = await service.bases.create({ name: "target" });
  const other = await service.bases.create({ name: "distractors" });
  await importText(service, base, [
    {
      title: "number",
      text: "planet",
      metadata: { value: 1, "x' OR 1=1--": "safe", empty: null },
    },
    { title: "boolean", text: "planet", metadata: { value: true } },
    { title: "string", text: "planet", metadata: { value: "1" } },
    { title: "missing", text: "planet" },
  ]);
  await importText(service, other, [
    { title: "many", text: "planet other information. ".repeat(1400) },
  ]);
  const query = (filter) =>
    service.search({
      knowledgeBaseIds: [base.id],
      query: "planet",
      limit: 1,
      filter,
    });
  assert.equal(
    (await query({ field: "value", operator: "eq", value: 1 })).hits[0].title,
    "number",
  );
  assert.equal(
    (await query({ field: "value", operator: "eq", value: true })).hits[0]
      .title,
    "boolean",
  );
  assert.equal(
    (await query({ field: "value", operator: "eq", value: "1" })).hits[0].title,
    "string",
  );
  assert.equal(
    (await query({ field: "empty", operator: "eq", value: null })).hits[0]
      .title,
    "number",
  );
  assert.equal(
    (await query({ field: "x' OR 1=1--", operator: "eq", value: "safe" }))
      .hits[0].title,
    "number",
  );
  assert.equal(
    (await query({ field: "value", operator: "exists", exists: false })).hits[0]
      .title,
    "missing",
  );
  assert.equal(
    (await query({ field: "value", operator: "gt", value: 0 })).hits[0].title,
    "number",
  );
  assert.equal(
    (
      await query({
        operator: "and",
        conditions: [
          { field: "value", operator: "in", values: [1, true] },
          {
            operator: "not",
            condition: { field: "value", operator: "eq", value: true },
          },
        ],
      })
    ).hits[0].title,
    "number",
  );
  assert.equal(
    (await query({ field: "value", operator: "notIn", values: [1, "1"] }))
      .hits[0].title,
    "boolean",
  );
  assert.equal(
    (await query({ field: "value", operator: "ne", value: true })).hits[0]
      .knowledgeBaseId,
    base.id,
  );
});

test("duplicates, replacement, idempotency and partial import have explicit persistent outcomes", async (t) => {
  const f = await fixture(t);
  let service = f.service;
  const base = await service.bases.create(
    { name: "base" },
    { idempotencyKey: "create-base" },
  );
  assert.equal(
    (
      await service.bases.create(
        { name: "base" },
        { idempotencyKey: "create-base" },
      )
    ).id,
    base.id,
  );
  await rejectsCode(
    service.bases.create(
      { name: "different" },
      { idempotencyKey: "create-base" },
    ),
    "CONFLICT",
  );
  const input = {
    knowledgeBaseId: base.id,
    documents: [
      { title: "original", externalId: "note", text: "original content" },
    ],
  };
  const receipt = await service.documents.import(input, {
    idempotencyKey: "import-note",
  });
  const imported = await waitJob(service, receipt),
    id = imported.result.documents[0].documentId;
  assert.equal(
    (await service.documents.import(input, { idempotencyKey: "import-note" }))
      .id,
    receipt.id,
  );
  const duplicate = await waitJob(
    service,
    await service.documents.import(input),
  );
  assert.equal(duplicate.state, "failed");
  assert.equal(duplicate.error.code, "CONFLICT");
  const skipped = await waitJob(
    service,
    await service.documents.import({ ...input, duplicatePolicy: "skip" }),
  );
  assert.equal(skipped.progress.skipped, 1);
  const mixed = await waitJob(
    service,
    await service.documents.import({
      knowledgeBaseId: base.id,
      documents: [
        ...input.documents,
        { title: "new", externalId: "new", text: "new content" },
      ],
    }),
  );
  assert.equal(mixed.state, "partially_succeeded");
  assert.equal(mixed.progress.failed, 1);
  await importText(
    service,
    base,
    [{ externalId: "note", title: "replacement", text: "replacement content" }],
    { duplicatePolicy: "replace" },
  );
  assert.equal(
    (await service.documents.get({ knowledgeBaseId: base.id, documentId: id }))
      .title,
    "replacement",
  );
  const db = new DatabaseSync(join(f.directory, "knowledge.sqlite"), {
    readOnly: true,
  });
  assert.equal(
    db.prepare("SELECT payload_json FROM kb_jobs WHERE id=?").get(receipt.id)
      .payload_json,
    "{}",
  );
  db.close();
  service = await f.reopen();
  assert.equal(
    (await service.documents.import(input, { idempotencyKey: "import-note" }))
      .id,
    receipt.id,
  );
  assert.equal(
    (await service.documents.list({ knowledgeBaseId: base.id })).items.length,
    2,
  );
});

test("host-created access views enforce method/base scope and isolate idempotency subjects", async (t) => {
  const { service } = await fixture(t);
  const a = await service.bases.create({ name: "a" }),
    b = await service.bases.create({ name: "b" });
  const imported = await importText(service, b, [
    { title: "private", text: "private planet" },
  ]);
  const scope = [a.id];
  const client = createKnowledgeClient(
    service.createTransport({
      subjectId: "app:a",
      knowledgeBaseIds: scope,
      methods: [
        "service.describe",
        "bases.list",
        "bases.get",
        "documents.get",
        "search",
      ],
    }),
  );
  scope.push(b.id);
  assert.deepEqual(
    (await client.bases.list()).items.map((base) => base.id),
    [a.id],
  );
  assert.ok(
    !(await client.service.describe()).capabilities.methods.includes(
      "bases.create",
    ),
  );
  await rejectsCode(
    client.bases.create({ name: "forbidden" }),
    "PERMISSION_DENIED",
  );
  await rejectsCode(
    client.search({
      knowledgeBaseIds: [b.id],
      query: "planet",
      allowPartial: true,
    }),
    "PERMISSION_DENIED",
  );
  await rejectsCode(
    client.documents.get({
      knowledgeBaseId: a.id,
      documentId: imported.result.documents[0].documentId,
    }),
    "NOT_FOUND",
  );
  const ownerA = createKnowledgeClient(
    service.createTransport({ subjectId: "owner:a" }),
  );
  const ownerB = createKnowledgeClient(
    service.createTransport({ subjectId: "owner:b" }),
  );
  assert.notEqual(
    (await ownerA.bases.create({ name: "same" }, { idempotencyKey: "key" })).id,
    (await ownerB.bases.create({ name: "same" }, { idempotencyKey: "key" })).id,
  );
  const raw = await service.transport.request({
    version: 1,
    method: "search",
    params: { knowledgeBaseIds: [a.id], query: "q", applicationId: "spoof" },
  });
  assert.equal(raw.ok, false);
  assert.equal(raw.error.code, "INVALID_ARGUMENT");
});

test("cursors are opaque, authenticated and bound to operation and access scope", async (t) => {
  const { service } = await fixture(t);
  const bases = await Promise.all(
    ["a", "b", "c"].map((name) => service.bases.create({ name })),
  );
  const first = await service.bases.list({ limit: 1 });
  assert.ok(first.nextCursor);
  const second = await service.bases.list({
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.notEqual(first.items[0].id, second.items[0].id);
  await rejectsCode(
    service.bases.list({ cursor: first.nextCursor + "tampered" }),
    "INVALID_ARGUMENT",
  );
  await rejectsCode(
    service.documents.list({
      knowledgeBaseId: bases[0].id,
      cursor: first.nextCursor,
    }),
    "INVALID_ARGUMENT",
  );
  const client = createKnowledgeClient(
    service.createTransport({ subjectId: "other" }),
  );
  await rejectsCode(
    client.bases.list({ cursor: first.nextCursor }),
    "INVALID_ARGUMENT",
  );
});

test("partial search reports missing bases and never silently converts errors into empty results", async (t) => {
  const { service } = await fixture(t);
  const base = await service.bases.create({ name: "base" });
  await importText(service, base, [{ title: "a", text: "planet" }]);
  await rejectsCode(
    service.search({ knowledgeBaseIds: [base.id, "missing"], query: "planet" }),
    "NOT_FOUND",
  );
  const partial = await service.search({
    knowledgeBaseIds: [base.id, "missing"],
    query: "planet",
    allowPartial: true,
  });
  assert.equal(partial.diagnostics.status, "partial");
  assert.equal(partial.hits[0].knowledgeBaseId, base.id);
  assert.equal(
    partial.diagnostics.targets.find(
      (target) => target.knowledgeBaseId === "missing",
    ).error.code,
    "NOT_FOUND",
  );
});

test("directory ownership and service lifecycle are explicit; unsupported backends do not fall back", async (t) => {
  const f = await fixture(t);
  await rejectsCode(
    createKnowledgeService({
      backend: { kind: "sqlite", directory: f.directory },
    }),
    "CONFLICT",
  );
  await rejectsCode(
    createKnowledgeService({
      backend: {
        kind: "mongodb",
        uri: "mongodb://localhost:27017",
        database: "x",
      },
    }),
    "NOT_SUPPORTED",
  );
  await rejectsCode(
    createKnowledgeService({
      backend: {
        kind: "remote",
        provider: "future",
        endpoint: "https://example.test",
      },
    }),
    "NOT_SUPPORTED",
  );
  await f.service.close();
  await f.service.close();
  await rejectsCode(f.service.bases.list(), "UNAVAILABLE");
  await f.reopen();
  assert.equal((await f.service.service.probe()).status, "ready");
  const another = await fixture(t);
  assert.notEqual(
    (await f.service.service.describe()).serviceId,
    (await another.service.service.describe()).serviceId,
  );
});

test("attachments require explicit storage and unsupported drivers never fall back", async (t) => {
  const { service, directory } = await fixture(t);
  const base = await service.bases.create({ name: "base" });
  const input = {
    knowledgeBaseId: base.id,
    fileName: "manual.pdf",
    mediaType: "application/pdf",
    sizeBytes: 128,
    sha256: "a".repeat(64),
  };
  assert.ok(
    !(
      await service.bases.get({ knowledgeBaseId: base.id })
    ).capabilities.methods.some((method) => method.startsWith("attachments.")),
  );
  await rejectsCode(service.attachments.createUpload(input), "NOT_SUPPORTED");
  await rejectsCode(
    service.documents.import({
      knowledgeBaseId: base.id,
      documents: [
        {
          title: "manual",
          text: "manual",
          source: { attachmentId: "original-a" },
        },
      ],
    }),
    "NOT_SUPPORTED",
  );
  assert.equal(
    (await service.jobs.list({ knowledgeBaseId: base.id })).items.length,
    0,
  );
  const restricted = createKnowledgeClient(
    service.createTransport({
      subjectId: "reader",
      knowledgeBaseIds: [base.id],
      methods: ["search"],
    }),
  );
  await rejectsCode(
    restricted.attachments.createUpload(input),
    "PERMISSION_DENIED",
  );
  const scoped = createKnowledgeClient(
    service.createTransport({
      subjectId: "uploader",
      knowledgeBaseIds: [base.id],
      methods: ["attachments.createUpload"],
    }),
  );
  await rejectsCode(
    scoped.attachments.createUpload({ ...input, knowledgeBaseId: "other" }),
    "PERMISSION_DENIED",
  );
  for (const attachmentStorage of [
    {
      kind: "object-storage",
      storageId: "originals",
      provider: "aliyun-oss",
      bucket: "private-originals",
    },
    { kind: "custom", storageId: "originals", provider: "caller-store" },
  ])
    await rejectsCode(
      createKnowledgeService({
        backend: {
          kind: "sqlite",
          directory: join(directory, "attachment-db"),
        },
        attachmentStorage,
      }),
      "NOT_SUPPORTED",
    );
  assert.ok(!(await readdir(directory)).includes("attachment-db"));
  assert.ok(!(await readdir(directory)).includes("originals"));
});
