import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { createServer } from "node:http";
import { ConfigDatabase } from "../../dist/storage/config/database.js";
import { KnowledgeRepository } from "../../dist/modules/knowledge/repository.js";
import { KnowledgeIndex } from "../../dist/modules/knowledge/indexer.js";
import { leaseDataDirectory } from "../../dist/storage/lease.js";
import { startServer } from "../../dist/server.js";
import { token } from "../support/helpers.mjs";
const binary = fileURLToPath(
  new URL(
    `../../../desktop/src-tauri/target/server-interop/debug/storage-interop${process.platform === "win32" ? ".exe" : ""}`,
    import.meta.url,
  ),
);
const runtimeFixture = fileURLToPath(
  new URL("../support/fixtures/runtime.mjs", import.meta.url),
);
const actualRuntime = fileURLToPath(
  new URL("../../../agent-runtime/dist/cli.js", import.meta.url),
);
const rust = (...args) => {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    timeout: 10000,
    input: "",
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
};
const temporary = async (t) => {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "isle-rust-node-")),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
};
const api =
  (server) =>
  async (name, args = {}) => {
    const response = await fetch(`${server.url}/api/commands/${name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };

test("Rust v24 config → Node HTTP read/write → Rust SQL write → Node read, using one file", async (t) => {
  const root = await temporary(t),
    path = join(root, "config.db");
  rust("config", path);
  rust(
    "exec",
    path,
    `INSERT INTO llm_providers VALUES('01950000000070008000000000000001','Rust provider','custom','openai-completions','fixture-secret',NULL,1,1,2);
    INSERT INTO provider_models(id,provider_id,model_id,model_name,created_at,updated_at) VALUES('01950000000070008000000000000002','01950000000070008000000000000001','fixture','Rust model',1,2);
    ALTER TABLE provider_models DROP COLUMN thinking_json; PRAGMA user_version=24;`,
  );
  const before = await fs.stat(path);
  let server = await startServer({
    token,
    port: 0,
    runtime: { dataDir: root, cliPath: runtimeFixture },
  });
  let call = api(server);
  try {
    const old = await call("get_llm_settings");
    assert.equal(old.providers[0].apiKey, "fixture-secret");
    const p = old.providers[0],
      m = p.models[0];
    await call("save_llm_settings", {
      input: {
        providers: [
          {
            id: p.id,
            name: "Node provider",
            provider: p.provider,
            apiFormat: p.apiFormat,
            apiKey: p.apiKey,
            isDefault: true,
            models: [
              {
                id: m.id,
                modelId: m.modelId,
                modelName: "Node model",
                isEnabled: true,
                isOneMillionContext: false,
                thinking: { levels: [{ value: "custom", label: "Custom" }] },
              },
            ],
          },
        ],
      },
    });
    await call("save_agent", {
      input: {
        name: "Node Agent",
        avatar: "cat-cream",
        category: "办公",
        instructions: "Node agent instructions",
      },
    });
  } finally {
    await server.close();
  }
  assert.equal((await fs.stat(path)).ino, before.ino);
  // The frozen Rust schema is v25; v26 deliberately retires its role table.
  assert.equal(rust("query", path, "PRAGMA user_version")[0].user_version, 26);
  assert.equal(
    rust(
      "query",
      path,
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='ai_agents'",
    )[0].n,
    0,
  );
  assert.equal(
    rust("query", path, "PRAGMA application_id")[0].application_id,
    0,
  );
  assert.equal(
    rust("query", path, "SELECT name FROM llm_providers")[0].name,
    "Node provider",
  );
  assert.equal(
    JSON.parse(
      rust("query", path, "SELECT thinking_json FROM provider_models")[0]
        .thinking_json,
    ).levels[0].value,
    "custom",
  );
  rust(
    "exec",
    path,
    `UPDATE agent_definitions SET definition_json=json_set(definition_json, '$.name', 'Rust updated Agent')`,
  );
  server = await startServer({
    token,
    port: 0,
    runtime: { dataDir: root, cliPath: runtimeFixture },
  });
  try {
    assert.equal(
      (await api(server)("get_agent_settings")).agents[0].name,
      "Rust updated Agent",
    );
  } finally {
    await server.close();
  }
  assert.equal((await fs.stat(path)).ino, before.ino);
  assert.equal(
    (await fs.readdir(root)).some(
      (n) => n.includes("server-settings") || n.includes("backup"),
    ),
    false,
  );
});

test("Rust and Node search each other's sqlite-vec index without rebuilding on backend switch", async (t) => {
  const root = await temporary(t),
    docs = join(root, "documents");
  await fs.mkdir(docs);
  await fs.mkdir(join(root, "rag"));
  await fs.writeFile(
    join(docs, "chapter.md"),
    "Shared library under the moon. 保存原有知识索引。",
  );
  const endpoint = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    const input = JSON.parse(body).input;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        data: input.map((_, index) => ({ index, embedding: [1, 0, 0] })),
      }),
    );
  });
  endpoint.listen(0, "127.0.0.1");
  await once(endpoint, "listening");
  t.after(() => endpoint.close());
  const config = new ConfigDatabase(root),
    repo = new KnowledgeRepository(config);
  t.after(() => config.close());
  const p = repo.saveProfile({
    name: "Shared",
    providerKind: "openai-compatible",
    baseUrl: `http://127.0.0.1:${endpoint.address().port}/v1`,
    modelId: "fixture",
    dimensions: 3,
  })[0];
  const c = repo.saveCollection(
      { name: "Library", enabled: true, embeddingProfileId: p.id },
      docs,
    ).collections[0],
    source = c.sourceIds[0];
  const path = join(root, "rag", "index.sqlite");
  const sql = await fs.readFile(
    new URL("../support/legacy-rust/rag-index.sql", import.meta.url),
    "utf8",
  );
  rust(
    "exec",
    path,
    sql +
      `INSERT INTO rag_documents(id,source_id,path,title,content_hash,created_at,updated_at) VALUES('rust-document','${source}','chapter.md','Rust chapter','hash',1,1);
    INSERT INTO rag_chunks(id,source_id,document_id,chunk_index,content,content_hash,created_at) VALUES('rust-chunk','${source}','rust-document',0,'Rust original content','hash',1);
    INSERT INTO rag_chunks_fts VALUES('rust-chunk','${source}','Rust chapter','chapter.md','Rust original content');
    INSERT INTO rag_index_state(id,version,status,document_count,chunk_count,updated_at) VALUES('${c.id}',3,'ready',1,1,1);`,
  );
  rust("vector-write", path, p.id, "rust-chunk", source);
  const before = await fs.stat(path);
  const index = new KnowledgeIndex(repo, root);
  try {
    assert.equal(index.status(c.id).status, "ready");
    const found = await index.search({
      collectionIds: [c.id],
      query: "completely unrelated words",
    });
    assert.equal(found.matches[0].chunkId, "rust-chunk");
    const rebuilt = await index.rebuild({ collectionId: c.id });
    assert.equal(rebuilt.status.status, "ready");
  } finally {
    index.close();
  }
  const hits = rust("vector-search", path, p.id, source);
  assert.equal(hits.length, 1);
  assert.notEqual(hits[0].chunkId, "rust-chunk");
  assert.equal(hits[0].score, 1);
  assert.equal(
    rust(
      "query",
      path,
      "SELECT typeof(vector) AS kind,length(vector) AS bytes FROM rag_embeddings",
    )[0].bytes,
    12,
  );
  const rows = rust(
    "query",
    path,
    "SELECT c.content,d.title FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id",
  );
  assert.match(rows[0].content, /Shared library/);
  assert.equal(rows[0].title, "chapter.md");
  assert.equal((await fs.stat(path)).ino, before.ino);
  const reopened = new KnowledgeIndex(repo, root);
  try {
    assert.equal(reopened.status(c.id).status, "ready");
  } finally {
    reopened.close();
  }
});

test("Node and Rust share the original lifetime lock and release it on process death", async (t) => {
  const root = await temporary(t),
    path = join(root, "apps", ".layout.lock");
  const release = leaseDataDirectory(root);
  try {
    assert.equal(
      spawnSync(binary, ["lock", path], { input: "", timeout: 10000 }).status,
      2,
    );
  } finally {
    release();
  }
  const child = spawn(binary, ["lock", path], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  assert.match(String((await once(child.stdout, "data"))[0]), /locked/);
  assert.throws(() => leaseDataDirectory(root), { code: "SERVER_DATA_IN_USE" });
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  leaseDataDirectory(root)();
});

test("original app namespace, settings.yaml and storage.sqlite stay usable after switching and legacy layout follows the existing helper", async (t) => {
  const root = await temporary(t),
    app = "@fixture/shared",
    apps = join(root, "apps"),
    oldPackage = join(apps, "packages", "old");
  const oldData = join(apps, "data", Buffer.from(app).toString("hex"));
  await fs.mkdir(oldPackage, { recursive: true });
  await fs.mkdir(oldData, { recursive: true });
  await fs.writeFile(
    join(oldPackage, "package.json"),
    JSON.stringify({
      name: app,
      version: "1.0.0",
      type: "module",
      isle: {
        app: { version: 1, entry: "index.js" },
        permissions: ["application-data", "application-workspaces"],
      },
    }),
  );
  await fs.writeFile(
    join(oldPackage, "index.js"),
    'export default {name:"fixture",apply(){}}',
  );
  await fs.writeFile(
    join(apps, "registry.json"),
    JSON.stringify({ schemaVersion: 1, enabled: { [app]: true } }),
  );
  await fs.writeFile(
    join(apps, "settings.yaml"),
    "fixture-shared:\n  keep: true\n",
  );
  rust(
    "exec",
    join(oldData, "storage.sqlite"),
    "CREATE TABLE application_kv(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);INSERT INTO application_kv VALUES('from-rust','{\"keep\":true}');PRAGMA user_version=1;",
  );
  const server = await startServer({
    token,
    port: 0,
    runtime: {
      dataDir: root,
      cliPath: actualRuntime,
      bundledApplicationsPath: join(root, "empty-bundled"),
    },
  });
  try {
    const call = api(server),
      list = await call("list_applications");
    assert.equal(list[0].id, app);
    const connection = await call("connect_application_data", {
      applicationId: app,
    });
    const request = (method, params) =>
      call("request_application_data", {
        connection,
        request: { version: 1, method, params },
      });
    assert.deepEqual(
      (await request("storage.getItem", { key: "from-rust" })).value,
      { keep: true },
    );
    await request("storage.setItem", {
      key: "from-node",
      value: { updated: true },
    });
    const namespace = join(apps, "@fixture", "shared");
    assert.match(
      await fs.readFile(join(namespace, "settings.yaml"), "utf8"),
      /keep: true/,
    );
    assert.equal(
      rust(
        "query",
        join(namespace, "storage.sqlite"),
        "SELECT value FROM application_kv WHERE key='from-node'",
      )[0].value,
      '{"updated":true}',
    );
  } finally {
    await server.close();
  }
});
