import test from "node:test";
import assert from "node:assert/strict";
import {
  createKnowledgeClient,
  parseKnowledgeRequest,
  parseKnowledgeResponse,
  isKnowledgeMutation,
} from "@mewvis/knowledge-sdk";
import {
  attachment,
  attachmentInput,
  attachmentReference,
  upload,
  download,
  document,
  job,
  success,
  copy,
} from "./fixtures.mjs";

const rejectsCode = (promise, code) =>
  assert.rejects(promise, (error) => error.code === code);
const responding = (value) =>
  createKnowledgeClient({ version: 1, request: async () => success(value) });

test("attachment transfers remain separate from RPC and preserve scoped short-lived authority", async () => {
  const calls = [];
  const results = [upload, attachment, download];
  const client = createKnowledgeClient({
    version: 1,
    request: async (request) => {
      calls.push(request);
      return success(results.shift());
    },
  });
  const grant = await client.attachments.createUpload(attachmentInput, {
    idempotencyKey: "original-1",
  });
  assert.deepEqual(grant, upload);
  assert.ok(Object.isFrozen(grant.transfer));
  await client.attachments.completeUpload(attachmentReference, {
    idempotencyKey: "verify-1",
  });
  assert.deepEqual(
    await client.attachments.createDownload(attachmentReference),
    download,
  );
  assert.deepEqual(
    calls.map((call) => call.method),
    [
      "attachments.createUpload",
      "attachments.completeUpload",
      "attachments.createDownload",
    ],
  );
  assert.equal(calls[0].idempotencyKey, "original-1");
  assert.ok(!("body" in calls[0].params));
  assert.equal(isKnowledgeMutation("attachments.createDownload"), false);
  for (const method of [
    "createUpload",
    "completeUpload",
    "abortUpload",
    "delete",
  ])
    assert.equal(isKnowledgeMutation(`attachments.${method}`), true);
  await rejectsCode(
    client.attachments.createDownload(attachmentReference, {
      idempotencyKey: "not-a-mutation",
    }),
    "INVALID_ARGUMENT",
  );
});

test("upload metadata rejects paths, secret fields, binary JSON and invalid integrity declarations before transport", async () => {
  let requests = 0;
  const client = createKnowledgeClient({
    version: 1,
    request: async () => {
      requests++;
      return success(upload);
    },
  });
  for (const patch of [
    { fileName: "../manual.pdf" },
    { fileName: "C:\\manual.pdf" },
    { fileName: "." },
    { fileName: "manual\r\nInjected.pdf" },
    { fileName: "a".repeat(256) },
    { mediaType: "application/pdf\r\nX: 1" },
    { sizeBytes: -1 },
    { sizeBytes: 1.5 },
    { sha256: "a".repeat(63) },
    { sha256: "A".repeat(64) },
    { objectKey: "caller/chosen" },
    { bucket: "private" },
    { credentialRef: "secret" },
    { body: new Uint8Array([1]) },
    { base64: "AA==" },
    { localPath: "/a.pdf" },
  ])
    await rejectsCode(
      client.attachments.createUpload({ ...attachmentInput, ...patch }),
      "INVALID_ARGUMENT",
    );
  await rejectsCode(
    client.attachments.get({ attachmentId: attachment.id }),
    "INVALID_ARGUMENT",
  );
  assert.equal(requests, 0);
  assert.doesNotThrow(() =>
    parseKnowledgeRequest({
      version: 1,
      method: "attachments.createUpload",
      params: { ...attachmentInput, sizeBytes: 0 },
    }),
  );
});

test("transfer responses reject invalid protocols, direction, headers and premature ready states", () => {
  for (const transfer of [
    { kind: "http", url: "file:///secret", method: "PUT" },
    { kind: "http", url: "https://files.example/a\n", method: "PUT" },
    { kind: "http", url: "https://user:secret@example.test", method: "PUT" },
    { kind: "http", url: "https://files.example/a#secret", method: "PUT" },
    { kind: "http", url: "https://files.example/a", method: "GET" },
    {
      kind: "http",
      url: "https://files.example/a",
      method: "PUT",
      headers: { "X-Test": "a\r\nX: b" },
    },
    {
      kind: "http",
      url: "https://files.example/a",
      method: "PUT",
      headers: { Cookie: "session=secret" },
    },
    { kind: "host", token: " " },
    { kind: "host", token: "x\ny" },
    { kind: "host", token: "ok", expiresAt: "tomorrow" },
  ])
    assert.throws(
      () =>
        parseKnowledgeResponse(
          "attachments.createUpload",
          success({
            ...upload,
            transfer: { expiresAt: upload.transfer.expiresAt, ...transfer },
          }),
        ),
      (error) => error.code === "INVALID_RESPONSE",
    );
  assert.throws(
    () =>
      parseKnowledgeResponse(
        "attachments.completeUpload",
        success(upload.attachment),
      ),
    (error) => error.code === "INVALID_RESPONSE",
  );
  assert.throws(
    () =>
      parseKnowledgeResponse(
        "attachments.createUpload",
        success({ ...upload, attachment }),
      ),
    (error) => error.code === "INVALID_RESPONSE",
  );
  const direct = {
    kind: "http",
    method: "PUT",
    url: "https://files.example/staging?signature=temporary",
    headers: {
      "Content-Type": "application/pdf",
      "X-Upload-Token": "temporary",
    },
    expiresAt: upload.transfer.expiresAt,
  };
  assert.deepEqual(
    parseKnowledgeResponse(
      "attachments.createUpload",
      success({ ...upload, transfer: direct }),
    ).value.transfer,
    direct,
  );
  assert.equal(
    parseKnowledgeResponse(
      "attachments.createDownload",
      success({
        ...download,
        transfer: { ...upload.transfer, token: "download-token" },
      }),
    ).ok,
    true,
  );
});

test("all attachment operations reject another base or attachment and enforce upload echo and page scope", async () => {
  const cases = [
    ["get", attachmentReference, { ...attachment, knowledgeBaseId: "other" }],
    ["get", attachmentReference, { ...attachment, id: "other" }],
    [
      "list",
      { knowledgeBaseId: attachment.knowledgeBaseId },
      {
        items: [{ ...attachment, knowledgeBaseId: "other" }],
        nextCursor: null,
      },
    ],
    [
      "createUpload",
      attachmentInput,
      {
        ...upload,
        attachment: { ...upload.attachment, knowledgeBaseId: "other" },
      },
    ],
    [
      "createUpload",
      attachmentInput,
      {
        ...upload,
        attachment: { ...upload.attachment, sha256: "b".repeat(64) },
      },
    ],
    [
      "createUpload",
      attachmentInput,
      { ...upload, attachment: { ...upload.attachment, sizeBytes: 99 } },
    ],
    ["completeUpload", attachmentReference, { ...attachment, id: "other" }],
    [
      "abortUpload",
      attachmentReference,
      { ...attachmentReference, attachmentId: "other", aborted: true },
    ],
    [
      "createDownload",
      attachmentReference,
      { ...download, attachmentId: "other" },
    ],
    [
      "delete",
      attachmentReference,
      { ...attachmentReference, knowledgeBaseId: "other", deleted: true },
    ],
    [
      "list",
      { knowledgeBaseId: attachment.knowledgeBaseId, limit: 1 },
      { items: [attachment, { ...attachment, id: "b" }], nextCursor: null },
    ],
    [
      "list",
      { knowledgeBaseId: attachment.knowledgeBaseId },
      { items: [attachment, attachment], nextCursor: null },
    ],
  ];
  for (const [method, input, result] of cases)
    await rejectsCode(
      responding(result).attachments[method](input),
      "INVALID_RESPONSE",
    );
});

test("managed originals use explicit source IDs while provenance URIs remain passive", async () => {
  const source = {
    uri: "urn:manual:original",
    mediaType: attachment.mediaType,
    attachmentId: attachment.id,
  };
  const input = {
    knowledgeBaseId: attachment.knowledgeBaseId,
    documents: [{ title: document.title, text: document.text, source }],
  };
  const request = parseKnowledgeRequest({
    version: 1,
    method: "documents.import",
    params: input,
  });
  assert.deepEqual(request.params.documents[0].source, source);
  assert.equal((await responding(job).documents.import(input)).kind, "import");
  assert.deepEqual(
    (
      await responding({ ...document, source }).documents.get({
        knowledgeBaseId: document.knowledgeBaseId,
        documentId: document.id,
      })
    ).source,
    source,
  );
  const changed = copy(input);
  changed.documents[0].source.storageId = "not-a-public-field";
  assert.throws(
    () =>
      parseKnowledgeRequest({
        version: 1,
        method: "documents.import",
        params: changed,
      }),
    (error) => error.code === "INVALID_ARGUMENT",
  );
});
