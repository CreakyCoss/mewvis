import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  createKnowledgeClient,
  parseKnowledgeRequest,
} from "@mewvis/knowledge-sdk";
import { createKnowledgeHttpTransport } from "@mewvis/knowledge-sdk/http";
import { base, search, success, failure } from "./fixtures.mjs";

const input = { knowledgeBaseIds: [base.id], query: "档案在哪里？" };
const rejectsCode = (promise, code) =>
  assert.rejects(promise, (error) => error.code === code);

test("HTTP round trip uses the exact endpoint and the same contract as a host bridge", async (t) => {
  const received = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    received.push({
      url: req.url,
      method: req.method,
      headers: req.headers,
      request: parseKnowledgeRequest(JSON.parse(body)),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(success(search)));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const endpoint = `http://127.0.0.1:${server.address().port}/knowledge/v1?connection=a`;
  let headerCalls = 0;
  const client = createKnowledgeClient(
    createKnowledgeHttpTransport({
      endpoint,
      headers: async () => {
        headerCalls++;
        return { authorization: "Bearer fixture-only" };
      },
    }),
  );
  assert.deepEqual(await client.search(input), search);
  assert.equal(headerCalls, 1);
  assert.equal(received.length, 1);
  assert.equal(received[0].url, "/knowledge/v1?connection=a");
  assert.equal(received[0].method, "POST");
  assert.equal(received[0].headers.authorization, "Bearer fixture-only");
  assert.equal(received[0].headers["content-type"], "application/json");
  assert.deepEqual(received[0].request, {
    version: 1,
    method: "search",
    params: input,
  });
  assert.ok(!JSON.stringify(received[0].request).includes("fixture-only"));
});

test("HTTP authentication is caller-owned; credentials and redirects are not implicitly inherited", async () => {
  const headers = { authorization: "Bearer fixture" };
  let actual;
  const transport = createKnowledgeHttpTransport({
    endpoint: "https://example.test/custom",
    headers,
    fetch: async (url, options) => {
      actual = { url, ...options };
      return Response.json(success(search));
    },
  });
  headers.authorization = "changed";
  await createKnowledgeClient(transport).search(input);
  assert.equal(actual.headers.get("authorization"), "Bearer fixture");
  assert.equal(actual.credentials, "omit");
  assert.equal(actual.redirect, "error");
  assert.equal(actual.cache, "no-store");
  assert.ok(actual.signal instanceof AbortSignal);
  for (const endpoint of [
    "file:///tmp/knowledge",
    "https://user:secret@example.test",
    "not-a-url",
    "https://example.test/#fragment",
  ])
    assert.throws(
      () => createKnowledgeHttpTransport({ endpoint }),
      (error) => error.code === "INVALID_ARGUMENT",
    );
  assert.throws(
    () =>
      createKnowledgeHttpTransport({
        endpoint: "https://example.test",
        maxResponseBytes: 0,
      }),
    (error) => error.code === "INVALID_ARGUMENT",
  );
});

test("HTTP errors preserve protocol errors, normalize proxy failures and never retry writes", async () => {
  for (const [status, code] of [
    [401, "UNAUTHENTICATED"],
    [403, "PERMISSION_DENIED"],
    [429, "RATE_LIMITED"],
    [408, "TIMEOUT"],
    [504, "TIMEOUT"],
    [502, "UNAVAILABLE"],
    [503, "UNAVAILABLE"],
    [500, "TRANSPORT_ERROR"],
  ]) {
    let calls = 0;
    const client = createKnowledgeClient(
      createKnowledgeHttpTransport({
        endpoint: "https://example.test/rpc",
        fetch: async () => {
          calls++;
          return new Response("private upstream body", {
            status,
            headers: { "retry-after": "2" },
          });
        },
      }),
    );
    await assert.rejects(
      client.bases.create({ name: "base" }),
      (error) =>
        error.code === code &&
        error.retryAfterMs === 2000 &&
        !error.message.includes("private"),
    );
    assert.equal(calls, 1);
  }
  const protocol = createKnowledgeClient(
    createKnowledgeHttpTransport({
      endpoint: "https://example.test/rpc",
      fetch: async () =>
        Response.json(
          {
            ...failure("NOT_FOUND", "No such knowledge base"),
            requestId: "trace-a",
          },
          { status: 404 },
        ),
    }),
  );
  await assert.rejects(
    protocol.search(input),
    (error) => error.code === "NOT_FOUND" && error.requestId === "trace-a",
  );
});

test("HTTP rejects malformed, oversized and incompatible responses", async () => {
  const responses = [
    () => new Response("<html>login</html>"),
    () => new Response(Uint8Array.of(0xff)),
    () => Response.json({ version: 2, ok: true, value: search }),
    () => Response.json({ version: 1, ok: true, value: {} }),
  ];
  for (const response of responses) {
    const client = createKnowledgeClient(
      createKnowledgeHttpTransport({
        endpoint: "https://example.test/rpc",
        fetch: async () => response(),
      }),
    );
    await rejectsCode(client.search(input), "INVALID_RESPONSE");
  }
  const limited = createKnowledgeClient(
    createKnowledgeHttpTransport({
      endpoint: "https://example.test/rpc",
      maxResponseBytes: 20,
      fetch: async () => Response.json(success(search)),
    }),
  );
  await rejectsCode(limited.search(input), "INVALID_RESPONSE");
});

test("HTTP transport receives the request deadline and does not manufacture a server cancellation", async () => {
  let signal;
  let calls = 0;
  const client = createKnowledgeClient(
    createKnowledgeHttpTransport({
      endpoint: "https://example.test/rpc",
      fetch: async (_url, init) => {
        calls++;
        signal = init.signal;
        return new Promise((_, reject) =>
          init.signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          ),
        );
      },
    }),
    { timeoutMs: 10 },
  );
  await rejectsCode(client.search(input), "TIMEOUT");
  assert.ok(signal.aborted);
  assert.equal(calls, 1);
});
