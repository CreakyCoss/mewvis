import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createKnowledgeService } from "@mewvis/knowledge-service";
import { waitJob, rejectsCode } from "./helpers.mjs";

test("an abruptly exited worker releases ownership and resumes its durable job once", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-crash-test-"));
  let service;
  t.after(async () => {
    await service?.close();
    await rm(directory, { recursive: true, force: true });
  });
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      fileURLToPath(new URL("./fixtures/crash-worker.mjs", import.meta.url)),
      directory,
    ],
    { timeout: 5000 },
  );
  const accepted = JSON.parse(stdout);
  const db = new DatabaseSync(join(directory, "knowledge.sqlite"), {
    readOnly: true,
  });
  assert.equal(
    db.prepare("SELECT state FROM kb_jobs WHERE id=?").get(accepted.id).state,
    "running",
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM kb_documents").get().n, 0);
  db.close();
  service = await createKnowledgeService(
    { backend: { kind: "sqlite", directory } },
    {
      embedding: {
        signature: "crash-test",
        dimensions: 3,
        embed: async (documents) => documents.map(() => [1, 0, 0]),
      },
    },
  );
  assert.equal((await waitJob(service, accepted)).state, "succeeded");
  assert.equal(
    (
      await service.documents.list({
        knowledgeBaseId: accepted.knowledgeBaseId,
      })
    ).items.length,
    1,
  );
});

test("newer or unrelated SQLite databases are rejected without destructive repair", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-schema-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "knowledge.sqlite");
  let db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE unrelated(value TEXT);INSERT INTO unrelated VALUES('keep');",
  );
  db.close();
  await rejectsCode(
    createKnowledgeService({ backend: { kind: "sqlite", directory } }),
    "CONFLICT",
  );
  db = new DatabaseSync(path);
  assert.equal(db.prepare("SELECT value FROM unrelated").get().value, "keep");
  db.exec("PRAGMA user_version=99");
  db.close();
  await rejectsCode(
    createKnowledgeService({ backend: { kind: "sqlite", directory } }),
    "NOT_SUPPORTED",
  );
});
