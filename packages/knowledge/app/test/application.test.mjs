import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createKnowledgeClient } from "@mewvis/knowledge-sdk";
import { createKnowledgeHttpTransport } from "@mewvis/knowledge-sdk/http";
import { startKnowledgeApplication } from "../dist/server/index.js";

test("complete web mode, headless mode and restart share caller-owned persistent data", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-app-"));
  const configuration = { backend: { kind: "sqlite", directory } };
  let app;
  t.after(async () => {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  });
  app = await startKnowledgeApplication({ configuration, port: 0 });
  const html = await fetch(app.server.url);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Mewvis 知识库/);
  const base = await app.service.bases.create({ name: "保留的知识库" });
  await Promise.all([app.close(), app.close()]);
  app = await startKnowledgeApplication({ configuration, port: 0, web: false });
  assert.equal((await fetch(app.server.url)).status, 404);
  const client = createKnowledgeClient(
    createKnowledgeHttpTransport({ endpoint: app.server.rpcEndpoint }),
  );
  assert.equal(
    (await client.bases.get({ knowledgeBaseId: base.id })).name,
    "保留的知识库",
  );
});

test("token is required for non-loopback binding and verified for RPC", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-app-token-"));
  const configuration = { backend: { kind: "sqlite", directory } };
  await assert.rejects(
    startKnowledgeApplication({ configuration, host: "0.0.0.0", port: 0 }),
    { code: "INVALID_ARGUMENT" },
  );
  const app = await startKnowledgeApplication({
    configuration,
    port: 0,
    web: false,
    token: "fixture-token",
  });
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  for (const token of [undefined, "wrong", "fixture-token"]) {
    const client = createKnowledgeClient(
      createKnowledgeHttpTransport({
        endpoint: app.server.rpcEndpoint,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );
    if (token === "fixture-token")
      assert.equal((await client.service.describe()).backend.kind, "sqlite");
    else
      await assert.rejects(client.service.describe(), {
        code: "UNAUTHENTICATED",
      });
  }
});

test("CLI explains explicit storage, rejects ambiguous flags and invalid ports", async () => {
  const run = promisify(execFile);
  const cli = new URL("../dist/server/cli.js", import.meta.url).pathname;
  assert.match(
    (await run(process.execPath, [cli, "--help"])).stdout,
    /--headless/,
  );
  for (const args of [
    [],
    ["--data", "/tmp/unused", "--config", "unused.json"],
    ["--data", "/tmp/unused", "--port", "wrong"],
  ])
    await assert.rejects(
      run(process.execPath, [cli, ...args]),
      (error) => error.code === 1 && !error.stderr.includes("at file:"),
    );
});
