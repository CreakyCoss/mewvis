import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { startServer } from "../../dist/server.js";
import { ConfigDatabase } from "../../dist/storage/config/database.js";
import { configSchema } from "../../dist/storage/config/schema.js";
import { token } from "../support/helpers.mjs";

const fixture = fileURLToPath(
  new URL("../support/fixtures/runtime.mjs", import.meta.url),
);
const uuid7 = /^[0-9a-f]{12}7[0-9a-f]{3}[89ab][0-9a-f]{15}$/;

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "isle-workspaces-"));
  const dataDir = join(root, "data");
  const options = { token, port: 0, runtime: { cliPath: fixture, dataDir } };
  let server = await startServer(options);
  t.after(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    dataDir,
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

function database(path, work) {
  const db = new DatabaseSync(path);
  try {
    return work(db);
  } finally {
    db.close();
  }
}

test("workspace list creates one persistent default under concurrent authenticated requests", async (t) => {
  const s = await setup(t);
  const unauthorized = await fetch(
    `${s.server.url}/api/commands/list_workspaces`,
    { method: "POST", body: "{}" },
  );
  assert.equal(unauthorized.status, 401);
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => s.invoke("list_workspaces")),
  );
  const [workspace] = responses[0];
  for (const value of responses) assert.deepEqual(value, [workspace]);
  assert.equal(workspace.name, "默认工作区");
  assert.equal(
    workspace.path,
    await realpath(join(s.dataDir, "default-workspace")),
  );
  assert.equal(workspace.isDefault, true);
  assert.equal(workspace.isPinned, true);
  assert.match(workspace.id, uuid7);
  assert.match(workspace.groupId, uuid7);
  database(join(workspace.path, "workspace.db"), (db) =>
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1),
  );
  await s.restart();
  assert.deepEqual(await s.invoke("list_workspaces"), [workspace]);
  await s.invoke("list_workspaces", { input: {} }, 400);
});

test("workspace CRUD initializes directories, preserves creation order and only deletes registration", async (t) => {
  const s = await setup(t);
  const [defaultWorkspace] = await s.invoke("list_workspaces");
  const path = join(s.root, "new", "project");
  const first = await s.invoke("create_workspace", {
    input: { name: " Project ", description: " ", path, groupId: "missing" },
  });
  assert.equal(first.name, "Project");
  assert.equal(first.description, null);
  assert.equal(first.groupId, defaultWorkspace.groupId);
  assert.equal(first.isDefault, false);
  assert.equal(first.isPinned, false);
  assert.equal(first.order, defaultWorkspace.order + 1);
  assert.equal((await stat(join(path, "workspace.db"))).isFile(), true);
  // Tauri allows multiple registrations pointing to the same ordinary directory.
  const duplicate = await s.invoke("create_workspace", {
    input: { name: "Alias", path },
  });
  assert.equal(duplicate.path, first.path);
  assert.notEqual(duplicate.id, first.id);
  const updated = await s.invoke("update_workspace", {
    input: { id: first.id, name: "Updated", description: " content ", path },
  });
  assert.equal(updated.createdAt, first.createdAt);
  assert.equal(updated.order, first.order);
  assert.equal(updated.description, "content");
  await s.restart();
  assert.deepEqual(
    (await s.invoke("list_workspaces")).find((w) => w.id === first.id),
    updated,
  );
  await writeFile(join(path, "keep.txt"), "keep");
  assert.equal(
    await s.invoke("delete_workspace", { input: { id: first.id } }),
    null,
  );
  assert.equal(await readFile(join(path, "keep.txt"), "utf8"), "keep");
  assert.equal((await stat(join(path, "workspace.db"))).isFile(), true);
  await s.invoke("delete_workspace", { input: { id: first.id } }, 404);
  await s.invoke("delete_workspace", { id: duplicate.id }, 400);
});

test("default workspace cannot be edited, deleted or targeted through aliases", async (t) => {
  const s = await setup(t);
  const [defaultWorkspace] = await s.invoke("list_workspaces");
  const ordinary = await s.invoke("create_workspace", {
    input: { name: "Project", path: join(s.root, "project") },
  });
  const attempts = [
    ["delete_workspace", { id: defaultWorkspace.id }],
    [
      "update_workspace",
      { id: defaultWorkspace.id, name: "Changed", path: ordinary.path },
    ],
    ["create_workspace", { name: "Alias", path: defaultWorkspace.path }],
    [
      "update_workspace",
      { id: ordinary.id, name: "Alias", path: defaultWorkspace.path },
    ],
  ];
  if (process.platform !== "win32") {
    const alias = join(s.root, "default-alias");
    await symlink(defaultWorkspace.path, alias);
    attempts.push(["create_workspace", { name: "Alias", path: alias }]);
    attempts.push([
      "update_workspace",
      { id: ordinary.id, name: "Alias", path: alias },
    ]);
  }
  for (const [name, input] of attempts) {
    const error = await s.invoke(name, { input }, 409);
    assert.equal(error.error.code, "DEFAULT_WORKSPACE_MANAGED");
  }
  assert.deepEqual(await s.invoke("list_workspaces"), [
    defaultWorkspace,
    ordinary,
  ]);
});

test("workspace path validation rejects files/relative paths and resolves symlink before parent traversal", async (t) => {
  const s = await setup(t);
  const file = join(s.root, "file");
  await writeFile(file, "untouched");
  for (const path of ["relative/path", " ", file, join(file, "child")]) {
    await s.invoke(
      "create_workspace",
      { input: { name: "Project", path } },
      400,
    );
  }
  const unused = join(s.root, "not-created");
  await s.invoke(
    "create_workspace",
    { input: { name: " ", path: unused } },
    400,
  );
  await s.invoke(
    "update_workspace",
    { input: { id: "missing", name: "Project", path: unused } },
    404,
  );
  await assert.rejects(stat(unused), { code: "ENOENT" });
  if (process.platform !== "win32") {
    await mkdir(join(s.root, "actual", "nested"), { recursive: true });
    await symlink(join(s.root, "actual", "nested"), join(s.root, "alias"));
    // Do not path.join this string: its lexical '..' normalization would remove the symlink.
    const created = await s.invoke("create_workspace", {
      input: { name: "Resolved", path: `${s.root}/alias/../project` },
    });
    assert.equal(
      created.path,
      await realpath(join(s.root, "actual", "project")),
    );
    const broken = join(s.root, "broken");
    await symlink(join(s.root, "missing"), broken);
    await s.invoke(
      "create_workspace",
      { input: { name: "Broken", path: broken } },
      400,
    );
  }
});

test("workspace initialization preserves existing data, rejects newer/corrupt DBs and symlinked DB files", async (t) => {
  const s = await setup(t);
  const path = join(s.root, "existing");
  await mkdir(path);
  const dbPath = join(path, "workspace.db");
  database(dbPath, (db) =>
    db.exec(
      "CREATE TABLE retained(value TEXT); INSERT INTO retained VALUES ('keep')",
    ),
  );
  await s.invoke("create_workspace", { input: { name: "Existing", path } });
  database(dbPath, (db) => {
    assert.equal(db.prepare("SELECT value FROM retained").get().value, "keep");
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 1);
    db.exec("PRAGMA user_version = 99");
  });
  const result = await s.invoke(
    "create_workspace",
    { input: { name: "Future", path } },
    409,
  );
  assert.equal(result.error.code, "WORKSPACE_SCHEMA_TOO_NEW");
  database(dbPath, (db) =>
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 99),
  );
  const corrupt = join(s.root, "corrupt");
  await mkdir(corrupt);
  await writeFile(join(corrupt, "workspace.db"), "corrupt-sentinel");
  await s.invoke(
    "create_workspace",
    { input: { name: "Corrupt", path: corrupt } },
    500,
  );
  assert.equal(
    await readFile(join(corrupt, "workspace.db"), "utf8"),
    "corrupt-sentinel",
  );
  if (process.platform !== "win32") {
    const alias = join(s.root, "database-alias");
    await mkdir(alias);
    await symlink(dbPath, join(alias, "workspace.db"));
    const error = await s.invoke(
      "create_workspace",
      { input: { name: "Linked", path: alias } },
      400,
    );
    assert.equal(error.error.code, "WORKSPACE_DATABASE_UNAVAILABLE");
  }
  assert.equal(
    (await s.invoke("list_workspaces")).filter((w) => !w.isDefault).length,
    1,
  );
});

test("moving workspace groups allocates order at destination and unknown groups fall back", async (t) => {
  const s = await setup(t);
  const [defaultWorkspace] = await s.invoke("list_workspaces");
  database(join(s.dataDir, "config.db"), (db) => {
    db.prepare(
      `INSERT INTO workspace_groups (id, name, "order", is_default, created_at, updated_at)
      VALUES ('another-group', 'Another', 1, 0, 1, 1)`,
    ).run();
  });
  const a = await s.invoke("create_workspace", {
    input: { name: "A", path: join(s.root, "a"), groupId: "another-group" },
  });
  const b = await s.invoke("create_workspace", {
    input: { name: "B", path: join(s.root, "b") },
  });
  const moved = await s.invoke("update_workspace", {
    input: { id: b.id, name: b.name, path: b.path, groupId: " another-group " },
  });
  assert.equal(moved.groupId, "another-group");
  assert.equal(moved.order, a.order + 1);
  const fallback = await s.invoke("update_workspace", {
    input: { id: b.id, name: b.name, path: b.path, groupId: "unknown" },
  });
  assert.equal(fallback.groupId, defaultWorkspace.groupId);
  assert.equal(fallback.order, defaultWorkspace.order + 1);
});

test("Rust v24 configuration upgrades without losing settings and preserves the default group across restarts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-workspace-upgrade-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "config.db");
  database(path, (db) => {
    db.exec(configSchema);
    db.exec("ALTER TABLE provider_models DROP COLUMN thinking_json");
    db.exec("PRAGMA user_version = 24;");
    db.exec(
      "INSERT INTO ai_agents VALUES ('existing-agent', 'Existing', 'pen', NULL, 1, 2)",
    );
    db.exec(
      "INSERT INTO llm_providers VALUES ('existing-provider', 'Existing', 'custom', 'openai-completions', 'secret', NULL, 1, 1, 2)",
    );
  });
  let config = new ConfigDatabase(root);
  const db = config.connection;
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 25);
  assert.equal(db.prepare("SELECT name FROM ai_agents").get().name, "Existing");
  assert.equal(
    db.prepare("SELECT api_key FROM llm_providers").get().api_key,
    "secret",
  );
  const group = db
    .prepare("SELECT id FROM workspace_groups WHERE is_default = 1")
    .get().id;
  assert.match(group, uuid7);
  config.close();
  config = new ConfigDatabase(root);
  assert.deepEqual(
    config.connection
      .prepare("SELECT id FROM workspace_groups")
      .all()
      .map((r) => r.id),
    [group],
  );
  config.close();
});

test("workspace DB lock errors do not register a partially initialized workspace", async (t) => {
  const s = await setup(t);
  const path = join(s.root, "locked");
  await mkdir(path);
  const locker = new DatabaseSync(join(path, "workspace.db"));
  try {
    locker.exec("BEGIN IMMEDIATE");
    const error = await s.invoke(
      "create_workspace",
      { input: { name: "Locked", path } },
      503,
    );
    assert.equal(error.error.code, "WORKSPACE_BUSY");
  } finally {
    locker.exec("ROLLBACK");
    locker.close();
  }
  assert.equal(
    (await s.invoke("list_workspaces")).filter((w) => !w.isDefault).length,
    0,
  );
  assert.equal(
    (await s.invoke("create_workspace", { input: { name: "Ready", path } }))
      .name,
    "Ready",
  );
});
