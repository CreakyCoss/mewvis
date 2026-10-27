import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { parseOriginal } from "../dist/server/parsing/index.js";
import { startKnowledgeApplication } from "../dist/server/index.js";
import { createKnowledgeClient } from "@mewvis/knowledge-sdk";
import { createKnowledgeHttpTransport } from "@mewvis/knowledge-sdk/http";
const fixture = (name) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url));
test("PDF parser preserves Unicode offsets and page numbers and rejects reserved/invalid inputs", async () => {
  const document = await parseOriginal(
    "资料.pdf",
    await fixture("local-knowledge.pdf"),
    new AbortController().signal,
  );
  assert.equal(document.locations.length, 2);
  assert.equal(document.locations[1].location.page, 2);
  const page2 = Array.from(document.text)
    .slice(document.locations[1].start, document.locations[1].end)
    .join("");
  assert.match(page2, /海鸥计划/);
  assert.match(page2, /林老师/);
  for (const [name, bytes, code] of [
    ["资料.docx", Buffer.from("reserved"), "NOT_SUPPORTED"],
    ["坏文件.pdf", Buffer.from("bad"), "INVALID_ARGUMENT"],
    ["扫描件.pdf", await fixture("image-only.pdf"), "NOT_SUPPORTED"],
    ["加密.pdf", await fixture("encrypted.pdf"), "INVALID_ARGUMENT"],
  ])
    await assert.rejects(
      parseOriginal(name, bytes, new AbortController().signal),
      { code },
    );
});
test("standalone HTTP uploads, parses, reparses and retrieves a PDF with correct page-two evidence after restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-pdf-http-"));
  let app = await startKnowledgeApplication({
    configuration: { backend: { kind: "sqlite", directory } },
    port: 0,
    token: "fixture",
  });
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const client = createKnowledgeClient(
    createKnowledgeHttpTransport({
      endpoint: app.server.rpcEndpoint,
      headers: { authorization: "Bearer fixture" },
    }),
  );
  const bytes = await fixture("local-knowledge.pdf"),
    base = await client.bases.create({ name: "PDF test" });
  const upload = await client.attachments.createUpload({
    knowledgeBaseId: base.id,
    fileName: "资料.pdf",
    mediaType: "application/pdf",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  const files = `${app.server.rpcEndpoint}/files`;
  assert.equal(
    (
      await fetch(files, {
        method: "PUT",
        headers: { "x-knowledge-transfer": upload.transfer.token },
        body: bytes,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(files, {
        method: "PUT",
        headers: {
          authorization: "Bearer fixture",
          "x-knowledge-transfer": upload.transfer.token,
        },
        body: bytes,
      })
    ).status,
    200,
  );
  const ref = { knowledgeBaseId: base.id, attachmentId: upload.attachment.id };
  await client.attachments.completeUpload(ref);
  const parsed = await fetch(`${app.server.rpcEndpoint}/parse`, {
    method: "POST",
    headers: {
      authorization: "Bearer fixture",
      "content-type": "application/json",
    },
    body: JSON.stringify(ref),
  });
  assert.equal(parsed.status, 200);
  const document = await parsed.json();
  const job = await client.documents.import({
    knowledgeBaseId: base.id,
    documents: [document],
  });
  let final;
  for (let i = 0; i < 100; i++) {
    final = await client.jobs.get({ knowledgeBaseId: base.id, jobId: job.id });
    if (!["queued", "running"].includes(final.state)) break;
    await delay(10);
  }
  assert.equal(final.state, "succeeded");
  const result = await client.search({
    knowledgeBaseIds: [base.id],
    query: "海鸥计划归档联系人",
    mode: "keyword",
  });
  assert.equal(result.hits[0].location.page, 2);
  assert.match(result.hits[0].text, /林老师/);
  assert.equal(result.hits[0].source.attachmentId, ref.attachmentId);
  const reparsed = await fetch(`${app.server.rpcEndpoint}/parse`, {
    method: "POST",
    headers: {
      authorization: "Bearer fixture",
      "content-type": "application/json",
    },
    body: JSON.stringify(ref),
  });
  assert.equal(reparsed.status, 200);
  const replacement = await client.documents.import({
    knowledgeBaseId: base.id,
    duplicatePolicy: "replace",
    documents: [await reparsed.json()],
  });
  for (let i = 0; i < 100; i++) {
    final = await client.jobs.get({
      knowledgeBaseId: base.id,
      jobId: replacement.id,
    });
    if (!["queued", "running"].includes(final.state)) break;
    await delay(10);
  }
  assert.equal(final.state, "succeeded");
  const documents = await client.documents.list({ knowledgeBaseId: base.id });
  assert.equal(documents.items.length, 1);
  assert.equal(documents.items[0].id, result.hits[0].documentId);
  const download = await client.attachments.createDownload(ref);
  const original = await fetch(files, {
    headers: {
      authorization: "Bearer fixture",
      "x-knowledge-transfer": download.transfer.token,
    },
  });
  assert.equal(original.headers.get("content-type"), "application/pdf");
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  assert.equal(
    (
      await fetch(files, {
        headers: {
          authorization: "Bearer fixture",
          "x-knowledge-transfer": "invalid",
        },
      })
    ).status,
    403,
  );
  await app.close();
  app = await startKnowledgeApplication({
    configuration: { backend: { kind: "sqlite", directory } },
    port: 0,
    token: "fixture",
  });
  const restartedClient = createKnowledgeClient(
    createKnowledgeHttpTransport({
      endpoint: app.server.rpcEndpoint,
      headers: { authorization: "Bearer fixture" },
    }),
  );
  const restartedDownload =
    await restartedClient.attachments.createDownload(ref);
  const persisted = await fetch(`${app.server.rpcEndpoint}/files`, {
    headers: {
      authorization: "Bearer fixture",
      "x-knowledge-transfer": restartedDownload.transfer.token,
    },
  });
  assert.deepEqual(Buffer.from(await persisted.arrayBuffer()), bytes);
  assert.equal(
    (
      await restartedClient.search({
        knowledgeBaseIds: [base.id],
        query: "海鸥计划归档联系人",
        mode: "keyword",
      })
    ).hits[0].location.page,
    2,
  );
});

test("PDF parsing obeys attachment permissions and validates request references", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-pdf-permission-"));
  const app = await startKnowledgeApplication({
    configuration: { backend: { kind: "sqlite", directory } },
    port: 0,
    access: { subjectId: "reader", methods: ["attachments.get"] },
  });
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = await app.service.bases.create({ name: "restricted" });
  const bytes = await fixture("local-knowledge.pdf");
  const upload = await app.service.attachments.createUpload({
    knowledgeBaseId: base.id,
    fileName: "资料.pdf",
    mediaType: "application/pdf",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  await app.service.createAttachmentGateway({ subjectId: "host" }).upload(
    upload.transfer.token,
    (async function* () {
      yield bytes;
    })(),
  );
  const ref = { knowledgeBaseId: base.id, attachmentId: upload.attachment.id };
  await app.service.attachments.completeUpload(ref);
  for (const [input, code] of [
    [ref, "PERMISSION_DENIED"],
    [{}, "INVALID_ARGUMENT"],
  ]) {
    const response = await fetch(`${app.server.rpcEndpoint}/parse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    assert.equal((await response.json()).error.code, code);
  }
});
