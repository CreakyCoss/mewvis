import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { createKnowledgeService } from "@mewvis/knowledge-service";
import { createKnowledgeClient } from "@mewvis/knowledge-sdk";
import { createKnowledgeHttpTransport } from "@mewvis/knowledge-sdk/http";
import { createKnowledgeHttpServer } from "../dist/index.js";

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-http-"));
  const service = await createKnowledgeService({
    backend: { kind: "sqlite", directory },
  });
  const server = await createKnowledgeHttpServer({
    port: 0,
    resolveTransport: () => service.transport,
    ...overrides,
  });
  t.after(async () => {
    await server.close();
    await service.close();
    await rm(directory, { recursive: true, force: true });
  });
  const client = createKnowledgeClient(
    createKnowledgeHttpTransport({ endpoint: server.rpcEndpoint }),
  );
  return { service, server, client };
}
const rpc = (server, body, headers = {}) =>
  fetch(server.rpcEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("SDK over HTTP imports, polls, retrieves Chinese evidence and reads its source", async (t) => {
  const { client } = await fixture(t);
  const base = await client.bases.create({ name: "验收资料" });
  const job = await client.documents.import(
    {
      knowledgeBaseId: base.id,
      documents: [
        {
          title: "权限说明",
          text: "新成员向项目管理员申请访问权限。",
          externalId: "access",
        },
      ],
    },
    { idempotencyKey: "http-import" },
  );
  assert.equal(
    (
      await client.documents.import(
        {
          knowledgeBaseId: base.id,
          documents: [
            {
              title: "权限说明",
              text: "新成员向项目管理员申请访问权限。",
              externalId: "access",
            },
          ],
        },
        { idempotencyKey: "http-import" },
      )
    ).id,
    job.id,
  );
  let final;
  for (let i = 0; i < 100; i++) {
    final = await client.jobs.get({ knowledgeBaseId: base.id, jobId: job.id });
    if (!["queued", "running", "cancelling"].includes(final.state)) break;
    await delay(10);
  }
  assert.equal(final.state, "succeeded");
  const search = await client.search({
    knowledgeBaseIds: [base.id],
    query: "新成员如何申请权限？",
  });
  assert.equal(search.hits.length, 1);
  const document = await client.documents.get({
    knowledgeBaseId: base.id,
    documentId: search.hits[0].documentId,
  });
  assert.ok(document.text.includes(search.hits[0].text));
});

test("transport resolution enforces authentication and scoped authorization", async (t) => {
  const { service, server } = await fixture(t, {
    resolveTransport: (request) =>
      request.headers.authorization === "Bearer fixture"
        ? service.createTransport({
            subjectId: "reader",
            methods: ["service.describe", "bases.list"],
            knowledgeBaseIds: [],
          })
        : null,
  });
  assert.equal(
    (await rpc(server, { version: 1, method: "bases.list", params: {} }))
      .status,
    401,
  );
  const client = createKnowledgeClient(
    createKnowledgeHttpTransport({
      endpoint: server.rpcEndpoint,
      headers: { authorization: "Bearer fixture" },
    }),
  );
  assert.deepEqual((await client.bases.list()).items, []);
  await assert.rejects(client.bases.create({ name: "denied" }), {
    code: "PERMISSION_DENIED",
  });
});

test("HTTP validates method, content type, JSON, envelope, Host and Origin", async (t) => {
  const { server } = await fixture(t);
  assert.equal((await fetch(server.rpcEndpoint)).status, 405);
  assert.equal(
    (await rpc(server, "{}", { "content-type": "text/plain" })).status,
    400,
  );
  for (const input of [
    "{",
    {},
    {
      version: 1,
      method: "search",
      params: { knowledgeBaseIds: [], query: "x" },
    },
  ])
    assert.equal((await rpc(server, input)).status, 400);
  assert.equal(
    (
      await rpc(
        server,
        { version: 1, method: "bases.list", params: {} },
        { origin: "https://attacker.invalid" },
      )
    ).status,
    403,
  );
  const deniedHost = await new Promise((resolve, reject) => {
    const req = httpRequest(
      server.rpcEndpoint,
      {
        method: "POST",
        headers: {
          host: "attacker.invalid",
          "content-type": "application/json",
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify({ version: 1, method: "bases.list", params: {} }));
  });
  assert.equal(deniedHost, 403);
  assert.equal((await fetch(`${server.url}/healthz`)).status, 200);
});

test("size limits and server deadlines return normalized errors; close aborts in-flight work", async (t) => {
  const small = await fixture(t, { maxRequestBytes: 32 });
  assert.equal((await rpc(small.server, " ".repeat(100))).status, 400);
  let signal;
  const { server } = await fixture(t, {
    requestTimeoutMs: 40,
    resolveTransport: () => ({
      version: 1,
      request: async (_request, context) => {
        signal = context.signal;
        return new Promise(() => {});
      },
    }),
  });
  const result = await rpc(server, {
    version: 1,
    method: "bases.list",
    params: {},
  });
  assert.equal(result.status, 504);
  assert.equal((await result.json()).error.code, "TIMEOUT");
  assert.equal(signal.aborted, true);
  await Promise.all([server.close(), server.close()]);
});

test("static delivery serves only web assets and rejects symlinks outside the web root", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-static-"));
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), "<h1>Knowledge</h1>");
  await writeFile(join(directory, "private.sqlite"), "private");
  await symlink(
    join(directory, "private.sqlite"),
    join(directory, "assets", "escape.js"),
  );
  const external = join(tmpdir(), `knowledge-external-${Date.now()}.js`);
  await writeFile(external, "secret");
  await symlink(external, join(directory, "assets", "external.js"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
    await rm(external, { force: true });
  });
  const { server } = await fixture(t, { staticDirectory: directory });
  const response = await fetch(server.url);
  assert.equal(await response.text(), "<h1>Knowledge</h1>");
  assert.ok(
    response.headers
      .get("content-security-policy")
      .includes("frame-ancestors 'none'"),
  );
  for (const path of ["/private.sqlite", "/assets/external.js", "/api/unknown"])
    assert.equal((await fetch(`${server.url}${path}`)).status, 404);
  assert.equal((await fetch(server.url, { method: "HEAD" })).status, 200);
});

test("invalid injected protocol results and unexpected exceptions are not leaked", async (t) => {
  for (const request of [
    async () => ({ version: 1, ok: true, value: { secret: "private" } }),
    async () => {
      throw new Error("private credential");
    },
  ]) {
    const { server } = await fixture(t, {
      resolveTransport: () => ({ version: 1, request }),
    });
    const response = await rpc(server, {
      version: 1,
      method: "bases.list",
      params: {},
    });
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes("private"));
  }
});
