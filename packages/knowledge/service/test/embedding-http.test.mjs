import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createKnowledgeService } from "@mewvis/knowledge-service";
import { importText, waitJob, rejectsCode } from "./helpers.mjs";

async function setup(t, provider = "openai-compatible", extra = {}) {
  const requests = [],
    control = { response: "normal" };
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    const input = JSON.parse(body);
    requests.push({
      url: req.url,
      authorization: req.headers.authorization,
      input,
    });
    if (control.response === "unavailable") {
      res.writeHead(503);
      res.end("private fixture upstream token");
      return;
    }
    if (control.response === "slow") {
      await delay(100);
      if (res.destroyed) return;
    }
    res.setHeader("content-type", "application/json");
    if (control.response === "null") {
      res.end("null");
      return;
    }
    const vectors = input.input.map(() =>
      control.response === "zero" ? [0, 0, 0] : [1, 0, 0],
    );
    if (provider === "ollama") res.end(JSON.stringify({ embeddings: vectors }));
    else
      res.end(
        JSON.stringify({
          data: vectors
            .map((embedding, index) => ({
              index: control.response === "duplicate-index" ? 0 : index,
              embedding,
            }))
            .reverse(),
        }),
      );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const directory = await mkdtemp(join(tmpdir(), "knowledge-embedding-http-"));
  let service;
  t.after(async () => {
    await service?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  service = await createKnowledgeService(
    {
      backend: { kind: "sqlite", directory },
      embedding: {
        provider,
        endpoint: `http://127.0.0.1:${server.address().port}${provider === "ollama" ? "/api/" : "/v1/"}`,
        model: "fixture-model",
        dimensions: 3,
        credentialRef: "embedding-credential",
        options: {
          batchSize: 2,
          requestTimeoutMs: 1000,
          queryTimeoutMs: 1000,
          documentPrefix: "document:",
          queryPrefix: "query:",
          sendInputType: true,
          ...extra,
        },
      },
    },
    {
      resolveCredential: async (reference) => {
        assert.equal(reference, "embedding-credential");
        return "fixture-not-a-real-token";
      },
      chunking: { maxCharacters: 12, overlapCharacters: 0 },
    },
  );
  return { service, requests, control, directory };
}

for (const provider of ["openai-compatible", "ollama"])
  test(`${provider} embedding adapter uses real HTTP, batching, dimensions and input roles`, async (t) => {
    const { service, requests, directory } = await setup(t, provider);
    const base = await service.bases.create({ name: "base" });
    await importText(service, base, [
      { title: "notes", text: "archive target. ".repeat(10) },
    ]);
    const documents = requests.filter(
      (request) => request.input.input_type === "document",
    );
    assert.ok(documents.length > 1);
    assert.ok(
      documents.every(
        (request) =>
          request.input.input.length <= 2 &&
          request.input.input.every((text) => text.startsWith("document:")),
      ),
    );
    assert.ok(
      documents.every(
        (request) =>
          request.input.dimensions === 3 &&
          request.authorization === "Bearer fixture-not-a-real-token",
      ),
    );
    assert.ok(
      documents.every(
        (request) =>
          request.url ===
          (provider === "ollama" ? "/api/embed" : "/v1/embeddings"),
      ),
    );
    if (provider === "ollama")
      assert.ok(documents.every((request) => request.input.truncate === false));
    const found = await service.search({
      knowledgeBaseIds: [base.id],
      query: "archive",
      mode: "vector",
      limit: 1,
    });
    assert.equal(found.hits.length, 1);
    assert.ok(requests.at(-1).input.input[0].startsWith("query:"));
    assert.equal(requests.at(-1).input.input_type, "query");
    assert.equal((await service.service.probe()).status, "ready");
    assert.ok(
      !JSON.stringify(await service.service.describe()).includes(
        "fixture-not-a-real-token",
      ),
    );
    await service.close();
    assert.ok(
      !(await readFile(join(directory, "knowledge.sqlite"))).includes(
        Buffer.from("fixture-not-a-real-token"),
      ),
    );
  });

test("HTTP failures and invalid vector responses cannot overwrite published documents", async (t) => {
  const { service, control } = await setup(t);
  const base = await service.bases.create({ name: "base" });
  const original = await importText(service, base, [
    { externalId: "note", title: "notes", text: "old archive" },
  ]);
  for (const response of ["unavailable", "null", "zero", "duplicate-index"]) {
    control.response = response;
    const job = await waitJob(
      service,
      await service.documents.import({
        knowledgeBaseId: base.id,
        duplicatePolicy: "replace",
        documents: [
          {
            externalId: "note",
            title: "notes",
            text: "changed archive ".repeat(3),
          },
        ],
      }),
    );
    assert.equal(job.state, "failed");
    assert.equal(
      job.error.code,
      response === "unavailable" ? "UNAVAILABLE" : "INVALID_RESPONSE",
    );
    assert.ok(!job.error.message.includes("private"));
    assert.equal(
      (
        await service.documents.get({
          knowledgeBaseId: base.id,
          documentId: original.result.documents[0].documentId,
        })
      ).text,
      "old archive",
    );
  }
});

test("query HTTP deadlines are separate from document indexing and fallback is visible", async (t) => {
  const { service, control } = await setup(t, "openai-compatible", {
    queryTimeoutMs: 10,
  });
  const base = await service.bases.create({ name: "base" });
  await importText(service, base, [{ title: "notes", text: "archive" }]);
  control.response = "slow";
  await rejectsCode(
    service.search({
      knowledgeBaseIds: [base.id],
      query: "archive",
      mode: "vector",
    }),
    "TIMEOUT",
  );
  const result = await service.search({
    knowledgeBaseIds: [base.id],
    query: "archive",
  });
  assert.ok(result.hits.length);
  assert.equal(result.diagnostics.warnings[0].code, "EMBEDDING_UNAVAILABLE");
});
