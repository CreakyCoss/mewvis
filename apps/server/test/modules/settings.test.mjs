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
const customAgent = (extra = {}) => ({
  name: "Writer",
  avatar: "cat-cream",
  category: "办公",
  instructions: "Draft carefully",
  ...extra,
});
const uuid7 = /^[0-9a-f]{12}7[0-9a-f]{3}[89ab][0-9a-f]{15}$/;
const model = (extra = {}) => ({
  modelId: " m1 ",
  modelName: " Model ",
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
  assert.deepEqual(await s.invoke("get_agent_settings"), { agents: [] });
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
    "get_agent_settings",
    "get_agent_templates",
    "add_agent_from_template",
    "reset_agent",
    "save_agent",
    "delete_agent",
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
          models: [model({ isOneMillionContext: true })],
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
  assert.equal(Object.hasOwn(saved.providers[0].models[0], "isEnabled"), false);
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
    provider({ models: [model({ isOneMillionContext: "yes" })] }),
  ]) {
    await s.invoke("save_llm_settings", { input: { providers: [bad] } }, 400);
    assert.deepEqual(await s.invoke("get_llm_settings"), original);
  }
});

test("agents start empty and persist manually created definitions across restarts", async (t) => {
  const s = await setup(t);
  const empty = await s.invoke("get_agent_settings");
  for (const name of [
    "get_ai_agent_settings",
    "save_ai_agent",
    "delete_ai_agent",
  ])
    await s.invoke(name, {}, 404);
  let settings = await s.invoke("save_agent", {
    input: customAgent({
      id: "invalid",
      name: " Writer ",
      summary: " ",
      skillKeys: ["skill", "skill"],
      toolNames: ["read_file"],
      knowledgeCollectionIds: ["knowledge"],
      useCases: ["撰写邮件"],
      starterPrompts: ["写一封邀请邮件"],
    }),
  });
  const writer = settings.agents[0];
  assert.match(writer.id, uuid7);
  assert.equal(writer.name, "Writer");
  assert.equal(writer.summary, "");
  assert.deepEqual(writer.skillKeys, ["skill"]);
  assert.deepEqual(writer.toolNames, ["read_file"]);
  assert.deepEqual(writer.knowledgeCollectionIds, ["knowledge"]);
  settings = await s.invoke("save_agent", {
    input: customAgent({
      id: writer.id,
      name: "Writer updated",
      instructions: "New working instructions",
    }),
  });
  const updated = settings.agents.find((agent) => agent.id === writer.id);
  assert.equal(updated.createdAt, writer.createdAt);
  assert.ok(updated.updatedAt >= writer.updatedAt);
  assert.equal(updated.instructions, "New working instructions");
  assert.equal(updated.templateId, null);
  await s.invoke("reset_agent", { id: writer.id }, 400);
  for (const bad of [
    customAgent({ instructions: " " }),
    customAgent({ skillKeys: [1] }),
    customAgent({ description: "retired" }),
    customAgent({ templateId: "template:office-assistant" }),
  ]) {
    await s.invoke("save_agent", { input: bad }, 400);
    assert.deepEqual(await s.invoke("get_agent_settings"), settings);
  }
  await s.restart();
  assert.deepEqual(await s.invoke("get_agent_settings"), settings);
  assert.deepEqual(await s.invoke("delete_agent", { id: writer.id }), empty);
  assert.deepEqual(await s.invoke("delete_agent", { id: writer.id }), empty);
});

test("system configurations add on demand, deduplicate and reset independently of user edits", async (t) => {
  const s = await setup(t);
  const library = await s.invoke("get_agent_templates");
  assert.deepEqual(await s.invoke("get_agent_settings"), { agents: [] });
  assert.equal(library.templates.length, 16);
  assert.equal(new Set(library.templates.map((item) => item.id)).size, 16);
  assert.equal(new Set(library.templates.map((item) => item.avatar)).size, 16);
  assert.ok(
    library.templates.every((item) => item.avatar.startsWith("agent-")),
  );
  assert.ok(
    library.templates.every(
      (item) =>
        item.id.startsWith("template:") &&
        item.instructions &&
        item.references.length,
    ),
  );
  const templateId = "template:code-reviewer";
  const reviewer = library.templates.find((item) => item.id === templateId);
  for (const command of [
    "get_agent_templates",
    "add_agent_from_template",
    "reset_agent",
  ]) {
    const unauthenticated = await fetch(
      `${s.server.url}/api/commands/${command}`,
      { method: "POST", body: "{}" },
    );
    assert.equal(unauthenticated.status, 401);
  }
  await s.invoke("get_agent_templates", { input: {} }, 400);
  await s.invoke("add_agent_from_template", { templateId: "missing" }, 400);
  await s.invoke(
    "add_agent_from_template",
    { templateId, name: "override" },
    400,
  );
  await s.invoke("reset_agent", { id: "missing" }, 404);
  await s.invoke("save_agent", { input: reviewer }, 400);
  const additions = await Promise.all(
    Array.from({ length: 4 }, () =>
      s.invoke("add_agent_from_template", { templateId }),
    ),
  );
  const added = additions[0].agents[0];
  assert.match(added.id, uuid7);
  assert.equal(added.templateId, templateId);
  assert.ok(
    additions.every(
      (result) =>
        result.agents.length === 1 && result.agents[0].id === added.id,
    ),
  );
  const {
    id: _templateId,
    references: _references,
    ...configuration
  } = reviewer;
  assert.deepEqual(added, {
    ...configuration,
    id: added.id,
    templateId,
    createdAt: added.createdAt,
    updatedAt: added.updatedAt,
  });
  let settings = await s.invoke("save_agent", {
    input: {
      ...configuration,
      id: added.id,
      name: "我的审查员",
      avatar: "cat-mint",
      summary: "定制审查",
      category: "自定义",
      instructions: "只检查数据库事务",
      useCases: ["数据库"],
      starterPrompts: ["检查事务"],
      skillKeys: ["custom-skill"],
      toolNames: ["read_file"],
      knowledgeCollectionIds: ["standards"],
    },
  });
  assert.equal(settings.agents[0].templateId, templateId);
  // Repeated addition never overwrites an edited agent.
  assert.deepEqual(
    await s.invoke("add_agent_from_template", { templateId }),
    settings,
  );
  await s.restart();
  assert.deepEqual(await s.invoke("get_agent_settings"), settings);
  settings = await s.invoke("reset_agent", { id: added.id });
  const reset = settings.agents[0];
  assert.deepEqual(reset, {
    ...configuration,
    id: added.id,
    templateId,
    createdAt: added.createdAt,
    updatedAt: reset.updatedAt,
  });
  assert.ok(reset.updatedAt >= added.updatedAt);
  assert.deepEqual(await s.invoke("get_agent_templates"), library);
  await s.restart();
  assert.deepEqual(await s.invoke("get_agent_settings"), settings);
  assert.deepEqual(await s.invoke("delete_agent", { id: added.id }), {
    agents: [],
  });
  const readded = (await s.invoke("add_agent_from_template", { templateId }))
    .agents[0];
  assert.notEqual(readded.id, added.id);
  assert.equal(readded.instructions, reviewer.instructions);
});

test("retired workflow commands are unavailable and legacy data cannot break chat role settings", async (t) => {
  const s = await setup(t);
  const db = new DatabaseSync(join(s.root, "config.db"));
  try {
    // Invalid historical JSON must no longer be parsed when loading or saving chat roles.
    db.prepare(
      `INSERT INTO collaboration_workflows
      (id, name, writer_agent_id, reviewer_agent_id, steps_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("legacy", "Saved flow", "writer", "reviewer", "invalid-json", 1, 2);
    const original = {
      ...db.prepare("SELECT * FROM collaboration_workflows").get(),
    };
    const catalog = await fetch(`${s.server.url}/api/commands`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const { commands } = await catalog.json();
    for (const name of [
      "save_collaboration_workflow",
      "delete_collaboration_workflow",
    ]) {
      assert.equal(commands.includes(name), false);
      const failure = await s.invoke(
        name,
        name.startsWith("save_") ? { input: {} } : { id: "legacy" },
        404,
      );
      assert.equal(failure.error.code, "COMMAND_NOT_FOUND");
    }
    const originalAgents = await s.invoke("get_agent_settings");
    const saved = await s.invoke("save_agent", {
      input: customAgent({ name: "Chat agent" }),
    });
    assert.deepEqual(Object.keys(saved), ["agents"]);
    assert.deepEqual(
      await s.invoke("delete_agent", {
        id: saved.agents[0].id,
      }),
      originalAgents,
    );
    await s.restart();
    assert.deepEqual(await s.invoke("get_agent_settings"), originalAgents);
    assert.deepEqual(
      { ...db.prepare("SELECT * FROM collaboration_workflows").get() },
      original,
    );
  } finally {
    db.close();
  }
});

test("database locks return a bounded retryable error and leave settings intact", async (t) => {
  const s = await setup(t);
  const locker = new DatabaseSync(join(s.root, "config.db"));
  try {
    locker.exec("BEGIN IMMEDIATE");
    const failure = await s.invoke("save_agent", { input: customAgent() }, 503);
    assert.equal(failure.error.code, "SETTINGS_BUSY");
  } finally {
    locker.exec("ROLLBACK");
    locker.close();
  }
  assert.deepEqual(await s.invoke("get_agent_settings"), { agents: [] });
  assert.equal(
    (
      await s.invoke("save_agent", {
        input: customAgent(),
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
    new URL("../support/legacy-rust/db/schema.rs", import.meta.url),
    "utf8",
  );
  const db = new DatabaseSync(join(s.root, "config.db"));
  try {
    for (const table of [
      "workspace_groups",
      "workspaces",
      "llm_providers",
      "provider_models",
      "collaboration_workflows",
    ]) {
      const columns = rust.match(
        new RegExp(`name: "${table}"[\\s\\S]*?columns: &\\[([\\s\\S]*?)\\]`),
      )[1];
      const expected = [...columns.matchAll(/"([^"]+)"/g)]
        .map((m) => m[1])
        .filter(
          (column) => table !== "provider_models" || column !== "is_enabled",
        )
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
