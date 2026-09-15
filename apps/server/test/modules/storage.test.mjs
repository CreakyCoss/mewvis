import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ConfigDatabase } from "../../dist/storage/config/database.js";
import {
  configSchema,
  configTables,
  CONFIG_SCHEMA_VERSION,
} from "../../dist/storage/config/schema.js";
import {
  ragSchema,
  vectorSchema,
} from "../../dist/modules/knowledge/storage/schema.js";
import { KnowledgeRepository } from "../../dist/modules/knowledge/repository.js";
import {
  runtimeConfig,
  runtimeEnvironment,
  desktopRuntimeDirectory,
} from "../../dist/config/runtime.js";
import { chunkDocument } from "../../dist/modules/knowledge/documents.js";
const rust = (path) =>
  readFile(
    new URL(`../../../desktop/src-tauri/src/${path}`, import.meta.url),
    "utf8",
  );
const norm = (s) => s.replace(/\s+/g, " ").trim();

test("Node uses original product and Tauri runtime paths without creating files", () => {
  const config = runtimeConfig({ env: {} });
  if (!process.env.ISLE_SERVER_DATA_DIR)
    assert.equal(config.dataDir, join(homedir(), ".isle-claw"));
  assert.equal(
    desktopRuntimeDirectory("com.isle-claw.desktop", "darwin", "/home", {}),
    "/home/Library/Application Support/com.isle-claw.desktop",
  );
  assert.equal(
    desktopRuntimeDirectory("app", "linux", "/home", { XDG_DATA_HOME: "/xdg" }),
    "/xdg/app",
  );
  const isolated = runtimeConfig({ dataDir: "/temporary/test" });
  assert.equal(
    runtimeEnvironment(isolated).PI_CODING_AGENT_DIR,
    "/temporary/test/pi-agent",
  );
  if (
    !process.env.ISLE_SERVER_DATA_DIR &&
    !process.env.ISLE_SERVER_RUNTIME_DATA_DIR
  )
    assert.equal(
      config.runtimeDataDir,
      desktopRuntimeDirectory("com.isle-claw.desktop"),
    );
});

test("all config, RAG and vector SQL definitions match production Rust", async () => {
  const source = await rust("db/schema.rs");
  const definitions = [
    ...source.matchAll(
      /name: "(\w+)",\s*columns: &\[([\s\S]*?)\],\s*create_sql: r#"([\s\S]*?)"#/g,
    ),
  ];
  assert.equal(definitions.length, configTables.length);
  for (const [_, name, cols, sql] of definitions) {
    const table = configTables.find((t) => t.name === name);
    assert.deepEqual(
      table.columns,
      [...cols.matchAll(/"(\w+)"/g)].map((m) => m[1]),
    );
    assert.equal(norm(table.sql), norm(sql));
  }
  assert.match(
    await rust("db/migrations/version.rs"),
    new RegExp(`CONFIG_SCHEMA_VERSION: i64 = ${CONFIG_SCHEMA_VERSION};`),
  );
  const index = (await rust("services/knowledge.rs"))
    .split("fn initialize_index_schema")[1]
    .match(/r#"([\s\S]*?)"#/)[1];
  assert.equal(norm(ragSchema), norm(index));
  const vec = (await rust("services/vector_store.rs")).split(
    "pub fn initialize_vector_metadata_schema",
  )[1];
  assert.equal(
    norm(vectorSchema),
    norm(
      [...vec.matchAll(/r#"([\s\S]*?)"#/g)].find((m) =>
        m[1].includes("CREATE TABLE IF NOT EXISTS rag_vector_entries"),
      )[1],
    ),
  );
});

export function legacyFixture(db, version) {
  db.exec(configSchema);
  const drop = (table, col) =>
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${col}`);
  if (version < 25) drop("provider_models", "thinking_json");
  if (version < 24) drop("knowledge_collections", "source_directory");
  if (version < 23) drop("knowledge_collections", "embedding_profile_id");
  if (version < 18)
    db.exec(
      "ALTER TABLE skill_groups ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0",
    );
  if (version < 17) drop("skill_group_skills", "disabled");
  if (version < 16)
    db.exec(
      "ALTER TABLE ai_agents ADD COLUMN provider_id TEXT; ALTER TABLE ai_agents ADD COLUMN model_id TEXT",
    );
  if (version === 14)
    db.exec(
      "ALTER TABLE skill_groups ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0",
    );
  if (version < 11)
    db.exec("ALTER TABLE embedding_profiles ADD COLUMN provider_id TEXT");
  if (version < 10) drop("embedding_profiles", "api_key");
  if (version < 9) drop("provider_models", "is_one_million_context");
  if (version < 8)
    db.exec(
      "ALTER TABLE llm_providers RENAME COLUMN provider TO vendor; ALTER TABLE llm_providers RENAME COLUMN api_format TO provider; ALTER TABLE llm_providers RENAME COLUMN api_endpoint TO base_url",
    );
  if (version < 7) drop("collaboration_workflows", "steps_json");
  if (version < 5) drop("embedding_profiles", "base_url");
  db.exec(`INSERT INTO skill_groups(id,name,created_at,updated_at) VALUES('group','keep',1,1);
    INSERT INTO skill_group_skills(group_id,skill_name,created_at) VALUES('group','upload:keep',99);
    INSERT INTO stories VALUES('story','keep','/story',1,1);
    INSERT INTO embedding_profiles(id,name,provider_kind,model_id,dimensions,created_at,updated_at) VALUES('profile','keep','ollama','fixture',3,1,1);
    INSERT INTO knowledge_collections(id,name,created_at,updated_at) VALUES('collection','keep',1,1);
    INSERT INTO knowledge_sources(id,kind,uri,title,created_at,updated_at) VALUES('source','directory','/knowledge','keep',1,1);
    INSERT INTO knowledge_collection_sources VALUES('collection','source',1);
    PRAGMA user_version=${version};`);
}

test("every Rust schema version v3–v25 upgrades without losing skill memberships and preserves physical column order", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-shared-schema-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (let version = 3; version <= 25; version++) {
    const dir = join(root, String(version));
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir);
    let raw = new DatabaseSync(join(dir, "config.db"));
    legacyFixture(raw, version);
    raw.close();
    const config = new ConfigDatabase(dir),
      db = config.connection;
    try {
      assert.equal(db.prepare("PRAGMA user_version").get().user_version, 25);
      assert.equal(db.prepare("PRAGMA application_id").get().application_id, 0);
      assert.equal(
        db.prepare("SELECT created_at FROM skill_group_skills").get()
          .created_at,
        99,
        `version ${version}`,
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM stories").get().n,
        version < 21 ? 0 : 1,
      );
      const c = db
        .prepare(
          "SELECT source_directory,embedding_profile_id FROM knowledge_collections",
        )
        .get();
      if (version < 24) assert.equal(c.source_directory, "/knowledge");
      if (version < 23) assert.equal(c.embedding_profile_id, "profile");
      const repo = new KnowledgeRepository(config);
      const saved = repo.saveCollection(
        { name: "new", enabled: true },
        "/another",
      );
      const created = saved.collections.find((c) => c.name === "new");
      assert.equal(created.sourceDirectory, "/another");
      assert.equal(created.enabled, true);
      assert.equal(created.color, null);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      config.close();
    }
  }
});

test("failed historical upgrade rolls back all changes and leaves version/data intact", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "isle-shared-rollback-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let raw = new DatabaseSync(join(root, "config.db"));
  legacyFixture(raw, 14);
  raw.exec(
    "ALTER TABLE llm_providers ADD COLUMN unexpected TEXT; CREATE TABLE extension_state(v TEXT); INSERT INTO extension_state VALUES('keep')",
  );
  raw.close();
  assert.throws(() => new ConfigDatabase(root), /表结构不兼容/);
  raw = new DatabaseSync(join(root, "config.db"));
  try {
    assert.equal(raw.prepare("PRAGMA user_version").get().user_version, 14);
    assert.equal(raw.prepare("SELECT name FROM stories").get().name, "keep");
    assert.equal(
      raw.prepare("SELECT created_at FROM skill_group_skills").get().created_at,
      99,
    );
    assert.equal(raw.prepare("SELECT v FROM extension_state").get().v, "keep");
  } finally {
    raw.close();
  }
});

test("chunks keep Rust semantic boundaries, Unicode offsets and CRLF normalization", () => {
  const content = "  " + "月".repeat(795) + "。" + "风".repeat(900) + "  ";
  const chunks = chunkDocument(content);
  assert.equal(chunks[0].charStart, 2);
  assert.equal(chunks[0].charEnd, 798);
  assert.equal(chunks[1].charStart, 638);
  assert.equal(
    chunkDocument("第一行\r\n第二行\r第三行")[0].content,
    "第一行\n第二行\n第三行",
  );
});
