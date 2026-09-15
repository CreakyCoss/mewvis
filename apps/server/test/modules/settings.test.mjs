import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { startServer } from "../../dist/server.js";
import { ConfigDatabase } from "../../dist/storage/config/database.js";
import { token } from "../support/helpers.mjs";

const fixture = fileURLToPath(
  new URL("../support/fixtures/runtime.mjs", import.meta.url),
);
const uuid7 = /^[0-9a-f]{12}7[0-9a-f]{3}[89ab][0-9a-f]{15}$/;
const model = (extra = {}) => ({
  modelId: " m1 ",
  modelName: " Model ",
  isEnabled: true,
  isOneMillionContext: false,
  ...extra,
});
const provider = (extra = {}) => ({
  name: " Provider ",
  provider: " custom ",
  apiFormat: " openai-completions ",
  apiKey: " secret-test-key ",
  isDefault: false,
  models: [model()],
  ...extra,
});

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "isle-server-settings-"));
  const options = {
    token,
    port: 0,
    runtime: { cliPath: fixture, dataDir: root },
  };
  let server = await startServer(options);
  t.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    get server() {
      return server;
    },
    async restart() {
      await server.close();
      server = await startServer(options);
    },
    async invoke(name, args = {}, status = 200) {
      const response = await fetch(`${server.url}/api/commands/${name}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(args),
      });
      const body = await response.json();
      assert.equal(response.status, status, JSON.stringify(body));
      return body;
    },
  };
}

test("settings commands use authenticated Tauri envelopes and isolated persisted defaults", async (t) => {
  const s = await setup(t);
  assert.deepEqual(await s.invoke("get_llm_settings"), { providers: [] });
  assert.deepEqual(await s.invoke("get_ai_agent_settings"), {
    agents: [],
    collaborationWorkflows: [],
  });
  const unauthenticated = await fetch(
    `${s.server.url}/api/commands/get_llm_settings`,
    { method: "POST", body: "{}" },
  );
  assert.equal(unauthenticated.status, 401);
  const catalog = await fetch(`${s.server.url}/api/commands`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const { commands } = await catalog.json();
  for (const name of [
    "get_llm_settings",
    "save_llm_settings",
    "get_ai_agent_settings",
    "save_ai_agent",
    "delete_ai_agent",
    "save_collaboration_workflow",
    "delete_collaboration_workflow",
  ])
    assert.ok(commands.includes(name));
  await s.invoke("get_llm_settings", { input: {} }, 400);
  await s.invoke("save_llm_settings", {}, 400);
  const saved = await s.invoke("save_llm_settings", {
    input: { providers: [provider()] },
  });
  await s.restart();
  assert.deepEqual(await s.invoke("get_llm_settings"), saved);
  const second = await setup(t);
  assert.deepEqual(await second.invoke("get_llm_settings"), { providers: [] });
  if (process.platform !== "win32")
    assert.equal((await stat(join(s.root, "config.db"))).mode & 0o777, 0o600);
});

test("LLM settings preserve custom thinking, normalize defaults and cascade removed models", async (t) => {
  const s = await setup(t);
  const thinking = {
    levels: [{ value: "provider-custom", label: "自定义" }],
    defaultLevel: "provider-custom",
  };
  const saved = await s.invoke("save_llm_settings", {
    input: {
      providers: [
        provider({ models: [model({ thinking })] }),
        provider({
          name: "Second",
          isDefault: true,
          models: [model({ isEnabled: false, isOneMillionContext: true })],
        }),
        provider({ name: "Third", isDefault: true, models: [] }),
      ],
    },
  });
  assert.equal(saved.providers[0].name, "Second");
  assert.equal(saved.providers.filter((p) => p.isDefault).length, 1);
  const p = saved.providers.find((p) => p.name === "Provider");
  assert.match(p.id, uuid7);
  assert.match(p.models[0].id, uuid7);
  assert.equal(p.apiKey, "secret-test-key");
  assert.equal(p.apiEndpoint, null);
  assert.equal(p.models[0].providerId, p.id);
  assert.deepEqual(p.models[0].thinking, thinking);
  assert.equal(p.models[0].modelId, "m1");
  assert.equal(saved.providers[0].models[0].isEnabled, false);
  assert.equal(saved.providers[0].models[0].isOneMillionContext, true);
  const replaced = await s.invoke("save_llm_settings", {
    input: { providers: [provider({ id: p.id, models: [] })] },
  });
  assert.equal(replaced.providers[0].id, p.id);
  assert.equal(replaced.providers[0].isDefault, true);
  const db = new DatabaseSync(join(s.root, "config.db"));
  try {
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM provider_models").get().n,
      0,
    );
  } finally {
    db.close();
  }
  assert.deepEqual(
    await s.invoke("save_llm_settings", { input: { providers: [] } }),
    { providers: [] },
  );
});

test("duplicate model failure rolls back the entire replacement without exposing keys or SQL", async (t) => {
  const s = await setup(t);
  const original = await s.invoke("save_llm_settings", {
    input: { providers: [provider()] },
  });
  const failure = await s.invoke(
    "save_llm_settings",
    {
      input: {
        providers: [
          provider({
            apiKey: "do-not-expose-secret",
            models: [model(), model()],
          }),
        ],
      },
    },
    409,
  );
  assert.equal(failure.error.code, "SETTINGS_CONFLICT");
  assert.doesNotMatch(
    JSON.stringify(failure),
    /do-not-expose-secret|INSERT|provider_models/,
  );
  assert.deepEqual(await s.invoke("get_llm_settings"), original);
  for (const bad of [
    provider({ name: " " }),
    provider({ isDefault: 1 }),
    provider({ models: [model({ isEnabled: "yes" })] }),
  ]) {
    await s.invoke("save_llm_settings", { input: { providers: [bad] } }, 400);
    assert.deepEqual(await s.invoke("get_llm_settings"), original);
  }
});

test("Agent and workflow CRUD preserve IDs/timestamps and derive participants from steps", async (t) => {
  const s = await setup(t);
  let settings = await s.invoke("save_ai_agent", {
    input: {
      id: "invalid",
      name: " Writer ",
      avatar: " pen ",
      description: " ",
    },
  });
  const writer = settings.agents[0];
  assert.match(writer.id, uuid7);
  assert.equal(writer.name, "Writer");
  assert.equal(writer.description, null);
  settings = await s.invoke("save_ai_agent", {
    input: { name: "Reviewer", avatar: "review" },
  });
  const reviewer = settings.agents[1];
  settings = await s.invoke("save_ai_agent", {
    input: { id: writer.id, name: "Writer updated", avatar: "pen" },
  });
  assert.equal(settings.agents.length, 2);
  assert.equal(settings.agents[0].createdAt, writer.createdAt);
  assert.ok(settings.agents[0].updatedAt >= writer.updatedAt);
  const input = {
    name: " Workflow ",
    writerAgentId: "ignored",
    reviewerAgentId: "ignored",
    steps: [
      { name: "Draft", agentId: writer.id },
      { name: "Revise", agentId: writer.id },
      {
        name: "Review",
        agentId: reviewer.id,
        instruction: " check ",
        phase: " review ",
      },
    ],
  };
  settings = await s.invoke("save_collaboration_workflow", { input });
  const workflow = settings.collaborationWorkflows[0];
  assert.equal(workflow.writerAgentId, writer.id);
  assert.equal(workflow.reviewerAgentId, reviewer.id);
  assert.equal(workflow.steps[2].instruction, "check");
  for (const step of workflow.steps) assert.match(step.id, uuid7);
  settings = await s.invoke("save_collaboration_workflow", {
    input: { ...input, id: workflow.id, steps: [workflow.steps[0]] },
  });
  assert.equal(
    settings.collaborationWorkflows[0].createdAt,
    workflow.createdAt,
  );
  assert.equal(settings.collaborationWorkflows[0].reviewerAgentId, writer.id);
  await s.restart();
  assert.deepEqual(await s.invoke("get_ai_agent_settings"), settings);
  settings = await s.invoke("delete_ai_agent", { id: writer.id });
  assert.equal(settings.collaborationWorkflows.length, 1);
  assert.equal(settings.agents.length, 1);
  assert.deepEqual(
    await s.invoke("delete_ai_agent", { id: writer.id }),
    settings,
  );
  settings = await s.invoke("delete_collaboration_workflow", {
    id: workflow.id,
  });
  assert.deepEqual(settings.collaborationWorkflows, []);
  await s.invoke(
    "save_collaboration_workflow",
    { input: { ...input, steps: [] } },
    400,
  );
  await s.invoke("save_ai_agent", { input: { name: "Bad", avatar: " " } }, 400);
  await s.invoke("delete_ai_agent", { input: { id: reviewer.id } }, 400);
});

test("database locks return a bounded retryable error and leave settings intact", async (t) => {
  const s = await setup(t);
  const locker = new DatabaseSync(join(s.root, "config.db"));
  try {
    locker.exec("BEGIN IMMEDIATE");
    const failure = await s.invoke(
      "save_ai_agent",
      { input: { name: "Writer", avatar: "pen" } },
      503,
    );
    assert.equal(failure.error.code, "SETTINGS_BUSY");
  } finally {
    locker.exec("ROLLBACK");
    locker.close();
  }
  assert.deepEqual((await s.invoke("get_ai_agent_settings")).agents, []);
  assert.equal(
    (
      await s.invoke("save_ai_agent", {
        input: { name: "Writer", avatar: "pen" },
      })
    ).agents.length,
    1,
  );
});

test("database initialization rejects foreign and future schemas without rebuilding them", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-settings-schema-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "config.db");
  let db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE preserved (value TEXT); INSERT INTO preserved VALUES ('keep');",
  );
  db.close();
  assert.throws(() => new ConfigDatabase(root), /无法识别数据库/);
  db = new DatabaseSync(path);
  assert.equal(db.prepare("SELECT value FROM preserved").get().value, "keep");
  db.exec("DROP TABLE preserved; PRAGMA user_version = 999;");
  db.close();
  assert.throws(() => new ConfigDatabase(root), /版本高于/);
  db = new DatabaseSync(path);
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 999);
  db.close();
});

test("migrated configuration tables keep Tauri column names", async (t) => {
  const s = await setup(t);
  const rust = await readFile(
    new URL("../../../desktop/src-tauri/src/db/schema.rs", import.meta.url),
    "utf8",
  );
  const db = new DatabaseSync(join(s.root, "config.db"));
  try {
    for (const table of [
      "workspace_groups",
      "workspaces",
      "llm_providers",
      "provider_models",
      "ai_agents",
      "collaboration_workflows",
    ]) {
      const columns = rust.match(
        new RegExp(`name: "${table}"[\\s\\S]*?columns: &\\[([\\s\\S]*?)\\]`),
      )[1];
      const expected = [...columns.matchAll(/"([^"]+)"/g)]
        .map((m) => m[1])
        .sort();
      assert.deepEqual(
        db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((row) => row.name)
          .sort(),
        expected,
      );
    }
  } finally {
    db.close();
  }
});

test("failed HTTP startup releases its resources and the same data directory can be reopened", async (t) => {
  const s = await setup(t);
  const port = Number(new URL(s.server.url).port);
  const dataDir = join(s.root, "retry");
  await assert.rejects(
    startServer({ token, port, runtime: { cliPath: fixture, dataDir } }),
    { code: "EADDRINUSE" },
  );
  const recovered = await startServer({
    token,
    port: 0,
    runtime: { cliPath: fixture, dataDir },
  });
  await recovered.close();
  await recovered.close();
  await rm(dataDir, { recursive: true });
});
