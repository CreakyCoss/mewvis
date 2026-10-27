import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  symlink,
  readdir,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { createKnowledgeService } from "../dist/index.js";
import { createKnowledgeClient } from "@mewvis/knowledge-sdk";
import { createLocalAttachmentStorage } from "../dist/attachments/local.js";
import { waitJob } from "./helpers.mjs";

const bytes = Buffer.from("原始附件 🐈\n第二行");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const body = (data = bytes) =>
  (async function* () {
    yield data;
  })();
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-originals-"));
  const configuration = {
    backend: { kind: "sqlite", directory: join(directory, "db") },
    attachmentStorage: {
      kind: "local",
      storageId: "test-originals",
      directory: join(directory, "originals"),
    },
  };
  let service = await createKnowledgeService(configuration, options);
  t.after(async () => {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = await service.bases.create({ name: "base" });
  const input = {
    knowledgeBaseId: base.id,
    fileName: "原件.txt",
    mediaType: "text/plain",
    sizeBytes: bytes.length,
    sha256: digest(bytes),
  };
  return {
    service,
    base,
    input,
    directory,
    configuration,
    async restart() {
      await service.close();
      service = await createKnowledgeService(configuration, options);
      return service;
    },
  };
}
async function ready(f) {
  const upload = await f.service.attachments.createUpload(f.input);
  await f.service
    .createAttachmentGateway({ subjectId: "host" })
    .upload(upload.transfer.token, body());
  const reference = {
    knowledgeBaseId: f.base.id,
    attachmentId: upload.attachment.id,
  };
  await f.service.attachments.completeUpload(reference);
  return reference;
}
async function download(service, reference, subjectId = "host") {
  const client =
    subjectId === "host"
      ? service
      : createKnowledgeClient(service.createTransport({ subjectId }));
  const grant = await client.attachments.createDownload(reference);
  const file = await service
    .createAttachmentGateway({ subjectId })
    .download(grant.transfer.token);
  const chunks = [];
  for await (const part of file.body) chunks.push(part);
  return Buffer.concat(chunks);
}
test("local originals survive restart, preserve bytes, and enforce references", async (t) => {
  const f = await fixture(t);
  const reference = await ready(f);
  assert.deepEqual(await download(f.service, reference), bytes);
  const job = await waitJob(
    f.service,
    await f.service.documents.import({
      knowledgeBaseId: f.base.id,
      documents: [
        {
          title: "text",
          text: bytes.toString(),
          externalId: "original",
          source: { attachmentId: reference.attachmentId },
        },
      ],
    }),
  );
  assert.equal(job.state, "succeeded");
  await assert.rejects(f.service.attachments.delete(reference), {
    code: "CONFLICT",
  });
  const service = await f.restart();
  assert.deepEqual(await download(service, reference), bytes);
  const documentId = job.result.documents[0].documentId;
  assert.equal(
    (
      await waitJob(
        service,
        await service.documents.delete({
          knowledgeBaseId: f.base.id,
          documentIds: [documentId],
        }),
      )
    ).state,
    "succeeded",
  );
  await service.attachments.delete(reference, {
    idempotencyKey: "delete-original",
  });
  assert.equal(
    (
      await service.attachments.delete(reference, {
        idempotencyKey: "delete-original",
      })
    ).deleted,
    true,
  );
  await service.close();
  await assert.rejects(
    readFile(join(f.directory, "originals", "objects", reference.attachmentId)),
    { code: "ENOENT" },
  );
});
test("upload authority is bound to owner, base, method, state and expiry", async (t) => {
  const f = await fixture(t, { attachments: { uploadExpiryMs: 200 } });
  const uploader = createKnowledgeClient(
    f.service.createTransport({ subjectId: "alice" }),
  );
  const upload = await uploader.attachments.createUpload(f.input, {
    idempotencyKey: "upload",
  });
  assert.equal(
    (
      await uploader.attachments.createUpload(f.input, {
        idempotencyKey: "upload",
      })
    ).attachment.id,
    upload.attachment.id,
  );
  await assert.rejects(
    f.service
      .createAttachmentGateway({ subjectId: "bob" })
      .upload(upload.transfer.token, body()),
    { code: "PERMISSION_DENIED" },
  );
  await assert.rejects(
    f.service
      .createAttachmentGateway({ subjectId: "alice", knowledgeBaseIds: [] })
      .upload(upload.transfer.token, body()),
    { code: "PERMISSION_DENIED" },
  );
  const ref = {
    knowledgeBaseId: f.base.id,
    attachmentId: upload.attachment.id,
  };
  await assert.rejects(f.service.attachments.get(ref), {
    code: "PERMISSION_DENIED",
  });
  await assert.rejects(uploader.attachments.createDownload(ref), {
    code: "NOT_READY",
  });
  await delay(220);
  await assert.rejects(
    f.service
      .createAttachmentGateway({ subjectId: "alice" })
      .upload(upload.transfer.token, body()),
    { code: "PERMISSION_DENIED" },
  );
});
test("wrong size or checksum never publishes originals; retries and completion are idempotent", async (t) => {
  const f = await fixture(t),
    upload = await f.service.attachments.createUpload(f.input);
  const gateway = f.service.createAttachmentGateway({ subjectId: "host" });
  await assert.rejects(
    gateway.upload(upload.transfer.token, body(Buffer.from("bad"))),
    { code: "INVALID_ARGUMENT" },
  );
  const ref = {
    knowledgeBaseId: f.base.id,
    attachmentId: upload.attachment.id,
  };
  assert.equal((await f.service.attachments.get(ref)).state, "pending");
  await gateway.upload(upload.transfer.token, body());
  await gateway.upload(upload.transfer.token, body());
  assert.equal(
    (
      await f.service.attachments.completeUpload(ref, {
        idempotencyKey: "complete",
      })
    ).state,
    "ready",
  );
  assert.equal(
    (
      await f.service.attachments.completeUpload(ref, {
        idempotencyKey: "complete",
      })
    ).state,
    "ready",
  );
  await assert.rejects(gateway.upload(upload.transfer.token, body()), {
    code: "CONFLICT",
  });
  await assert.rejects(f.service.attachments.abortUpload(ref), {
    code: "CONFLICT",
  });
  const other = await f.service.bases.create({ name: "other" });
  await assert.rejects(
    f.service.documents.import({
      knowledgeBaseId: other.id,
      documents: [
        {
          title: "cross",
          text: "text",
          source: { attachmentId: ref.attachmentId },
        },
      ],
    }),
    { code: "NOT_FOUND" },
  );
});
test("running imports pin original references, and deleting a base cleans only managed copies", async (t) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture(t, {
    embedding: {
      signature: "held",
      dimensions: 3,
      async embed(inputs) {
        await held;
        return inputs.map(() => [1, 0, 0]);
      },
    },
  });
  const reference = await ready(f);
  const job = await f.service.documents.import({
    knowledgeBaseId: f.base.id,
    documents: [
      {
        title: "text",
        text: "text",
        source: {
          attachmentId: reference.attachmentId,
          uri: "file:///caller/source.txt",
        },
      },
    ],
  });
  await assert.rejects(f.service.attachments.delete(reference), {
    code: "CONFLICT",
  });
  release();
  assert.equal((await waitJob(f.service, job)).state, "succeeded");
  await waitJob(
    f.service,
    await f.service.bases.delete({ knowledgeBaseId: f.base.id }),
  );
  await f.service.close();
  await assert.rejects(
    readFile(join(f.directory, "originals", "objects", reference.attachmentId)),
    { code: "ENOENT" },
  );
});
test("storage binding is immutable and old database formats are rejected without migration", async (t) => {
  const f = await fixture(t);
  await f.service.close();
  await assert.rejects(
    createKnowledgeService({
      ...f.configuration,
      attachmentStorage: {
        ...f.configuration.attachmentStorage,
        directory: join(f.directory, "other"),
      },
    }),
    { code: "CONFLICT" },
  );
  await assert.rejects(
    createKnowledgeService({ backend: f.configuration.backend }),
    { code: "CONFLICT" },
  );
  const db = new DatabaseSync(join(f.directory, "db", "knowledge.sqlite"));
  db.exec("PRAGMA user_version=1");
  db.close();
  await assert.rejects(createKnowledgeService(f.configuration), {
    code: "NOT_SUPPORTED",
  });
  const readonly = new DatabaseSync(
    join(f.directory, "db", "knowledge.sqlite"),
    { readOnly: true },
  );
  assert.equal(readonly.prepare("PRAGMA user_version").get().user_version, 1);
  readonly.close();
});
test("local storage rejects path traversal, symlink reads and conflicting immutable writes", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "knowledge-driver-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const storage = await createLocalAttachmentStorage(
    join(dir, "originals"),
    "driver",
  );
  await assert.rejects(storage.get("../outside"), { code: "INVALID_ARGUMENT" });
  const key = "objects/11111111-1111-1111-1111-111111111111";
  await writeFile(join(dir, "outside"), bytes);
  await symlink(join(dir, "outside"), join(dir, "originals", key));
  await assert.rejects(storage.get(key), { code: "NOT_FOUND" });
  await storage.delete(key);
  assert.deepEqual(await readFile(join(dir, "outside")), bytes);
  await storage.put({
    key,
    body: body(),
    mediaType: "text/plain",
    sizeBytes: bytes.length,
    sha256: digest(bytes),
  });
  const other = Buffer.from("other");
  await assert.rejects(
    storage.put({
      key,
      body: body(other),
      mediaType: "text/plain",
      sizeBytes: other.length,
      sha256: digest(other),
    }),
    { code: "CONFLICT" },
  );
});

test("aborting a stalled upload removes partial bytes and permits a complete retry", async (t) => {
  const f = await fixture(t);
  const upload = await f.service.attachments.createUpload(f.input);
  const gateway = f.service.createAttachmentGateway({ subjectId: "host" });
  const controller = new AbortController();
  let started;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  const transfer = gateway.upload(
    upload.transfer.token,
    (async function* () {
      yield bytes.subarray(0, 3);
      started();
      await new Promise(() => {});
    })(),
    { signal: controller.signal },
  );
  const rejected = assert.rejects(transfer, { code: "ABORTED" });
  await waiting;
  controller.abort();
  await rejected;
  assert.deepEqual(
    await readdir(join(f.directory, "originals", "staging")),
    [],
  );
  await gateway.upload(upload.transfer.token, body());
  const reference = {
    knowledgeBaseId: f.base.id,
    attachmentId: upload.attachment.id,
  };
  await f.service.attachments.completeUpload(reference);
  assert.deepEqual(await download(f.service, reference), bytes);
});

test("startup reclaims expired unreferenced uploads and retains published originals", async (t) => {
  const f = await fixture(t);
  const pinned = await ready(f);
  const unreferenced = await ready(f);
  const pending = await f.service.attachments.createUpload(f.input);
  await waitJob(
    f.service,
    await f.service.documents.import({
      knowledgeBaseId: f.base.id,
      documents: [
        {
          title: "pinned",
          text: "保留正文",
          source: { attachmentId: pinned.attachmentId },
        },
      ],
    }),
  );
  await f.service.close();
  const db = new DatabaseSync(join(f.directory, "db", "knowledge.sqlite"));
  db.exec(
    "UPDATE kb_attachments SET created_at='2000-01-01T00:00:00.000Z',updated_at='2000-01-01T00:00:00.000Z'",
  );
  db.close();
  const service = await f.restart();
  const originals = await service.attachments.list({
    knowledgeBaseId: f.base.id,
  });
  assert.deepEqual(
    originals.items.map((item) => item.id),
    [pinned.attachmentId],
  );
  assert.deepEqual(await download(service, pinned), bytes);
  for (const id of [unreferenced.attachmentId, pending.attachment.id])
    await assert.rejects(
      service.attachments.get({ knowledgeBaseId: f.base.id, attachmentId: id }),
      { code: "NOT_FOUND" },
    );
  await service.close();
  await assert.rejects(
    readFile(
      join(f.directory, "originals", "objects", unreferenced.attachmentId),
    ),
    { code: "ENOENT" },
  );
});
