import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createKnowledgeService } from "@mewvis/knowledge-service";

export async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "mewvis-knowledge-service-"));
  let current = await createKnowledgeService(
    { backend: { kind: "sqlite", directory } },
    options,
  );
  t.after(async () => {
    await current.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    get service() {
      return current;
    },
    async reopen(nextOptions = options) {
      await current.close();
      current = await createKnowledgeService(
        { backend: { kind: "sqlite", directory } },
        nextOptions,
      );
      return current;
    },
  };
}
export async function waitJob(service, receipt) {
  const until = Date.now() + 5000;
  for (;;) {
    const job = await service.jobs.get({
      knowledgeBaseId: receipt.knowledgeBaseId,
      jobId: receipt.id,
    });
    if (
      ["succeeded", "partially_succeeded", "failed", "cancelled"].includes(
        job.state,
      )
    )
      return job;
    assert.ok(Date.now() < until, `job ${receipt.id} timed out (${job.state})`);
    await delay(2);
  }
}
export async function importText(service, base, documents, extra = {}) {
  const job = await waitJob(
    service,
    await service.documents.import({
      knowledgeBaseId: base.id,
      documents,
      ...extra,
    }),
  );
  assert.equal(job.state, "succeeded", JSON.stringify(job));
  return job;
}
export const rejectsCode = (promise, code) =>
  assert.rejects(promise, (error) => error.code === code);
export function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
