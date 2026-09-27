import type { DatabaseSync } from "node:sqlite";
import { configSchema, configTables, CONFIG_SCHEMA_VERSION } from "./schema.js";

const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const columns = (db: DatabaseSync, table: string) =>
  db
    .prepare(`PRAGMA table_info(${quote(table)})`)
    .all()
    .map((c) => String(c.name));

export function validateConfigSchema(db: DatabaseSync) {
  for (const table of configTables) {
    const actual = columns(db, table.name).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...table.columns].sort()))
      throw new Error(`配置库表结构不兼容：${table.name}`);
  }
}

/** Keeps the legacy upgrade chain; v26 discards retired roles without copying them. */
export function migrateConfig(db: DatabaseSync) {
  const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
  if (version > CONFIG_SCHEMA_VERSION)
    throw new Error("配置库版本高于当前后端，请升级后端");
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all();
  const fresh = tables.length === 0;
  if (Number(db.prepare("PRAGMA application_id").get()!.application_id) !== 0)
    throw new Error("配置库 application_id 与原配置库不兼容");
  // Reject an unrelated database before CREATE TABLE can modify it.
  if (!fresh && !tables.some((t) => t.name === "llm_providers"))
    throw new Error("配置库缺少原配置表，无法识别数据库");
  const has = (table: string, column: string) =>
    columns(db, table).includes(column);
  const add = (table: string, column: string, type: string) => {
    if (!has(table, column))
      db.exec(
        `ALTER TABLE ${quote(table)} ADD COLUMN ${quote(column)} ${type}`,
      );
  };
  const rebuild = (name: string) => {
    const table = configTables.find((t) => t.name === name)!;
    const names = table.columns.map(quote).join(",");
    db.exec(table.sql.replace(`IF NOT EXISTS ${name}`, `${name}_next`));
    db.exec(
      `INSERT INTO ${name}_next (${names}) SELECT ${names} FROM ${name}; DROP TABLE ${name}; ALTER TABLE ${name}_next RENAME TO ${name}`,
    );
  };
  // Disable FK actions BEFORE the transaction, so replacing a parent table cannot cascade-delete members.
  // All schema/data changes and the version stamp commit together, including on old partially upgraded DBs.
  db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
  try {
    db.exec(configSchema);
    db.exec("DROP TABLE IF EXISTS ai_agents");
    if (!fresh && version === 0) {
      validateConfigSchema(db);
      db.exec(
        "DELETE FROM stories; DELETE FROM skill_settings WHERE key='readonly_skill_group_members'",
      );
    } else if (!fresh) {
      for (
        let step = Math.max(4, version + 1);
        step <= CONFIG_SCHEMA_VERSION;
        step++
      ) {
        switch (step) {
          // Tables introduced by these versions have already been created by configSchema, as in Rust.
          case 4:
          case 6:
          case 12:
          case 19:
          case 20:
            break;
          case 5:
            add("embedding_profiles", "base_url", "TEXT");
            break;
          case 7:
            add("collaboration_workflows", "steps_json", "TEXT");
            break;
          case 8:
            if (
              has("llm_providers", "provider") &&
              !has("llm_providers", "api_format")
            )
              db.exec(
                "ALTER TABLE llm_providers RENAME COLUMN provider TO api_format",
              );
            if (
              has("llm_providers", "vendor") &&
              !has("llm_providers", "provider")
            )
              db.exec(
                "ALTER TABLE llm_providers RENAME COLUMN vendor TO provider",
              );
            add("llm_providers", "provider", "TEXT NOT NULL DEFAULT ''");
            if (
              has("llm_providers", "base_url") &&
              !has("llm_providers", "api_endpoint")
            )
              db.exec(
                "ALTER TABLE llm_providers RENAME COLUMN base_url TO api_endpoint",
              );
            add("llm_providers", "api_endpoint", "TEXT");
            break;
          case 9:
            add(
              "provider_models",
              "is_one_million_context",
              "INTEGER DEFAULT 0",
            );
            break;
          case 10:
            add("embedding_profiles", "api_key", "TEXT");
            break;
          case 11:
            if (has("embedding_profiles", "provider_id"))
              rebuild("embedding_profiles");
            break;
          case 13:
            db.exec("DROP TABLE IF EXISTS workspace_enabled_skills");
            break;
          case 14:
            add("skill_groups", "is_default", "INTEGER NOT NULL DEFAULT 0");
            break;
          case 15:
            if (has("skill_groups", "is_default")) rebuild("skill_groups");
            break;
          case 16:
            // Host roles are retired and discarded below.
            break;
          case 17:
          case 18:
            add("skill_group_skills", "disabled", "INTEGER NOT NULL DEFAULT 0");
            if (step === 18 && has("skill_groups", "disabled"))
              rebuild("skill_groups");
            break;
          case 21:
            db.exec("DELETE FROM stories");
            break;
          case 22:
            db.exec(
              "DELETE FROM skill_settings WHERE key='readonly_skill_group_members'",
            );
            break;
          case 23:
            add("knowledge_collections", "embedding_profile_id", "TEXT");
            db.exec(`UPDATE knowledge_collections SET embedding_profile_id=COALESCE(
              (SELECT id FROM embedding_profiles WHERE is_default=1 ORDER BY created_at ASC LIMIT 1),
              (SELECT id FROM embedding_profiles ORDER BY created_at ASC LIMIT 1)) WHERE embedding_profile_id IS NULL`);
            break;
          case 24:
            add("knowledge_collections", "source_directory", "TEXT");
            db.exec(`UPDATE knowledge_collections SET source_directory=COALESCE(
              (SELECT sources.uri FROM knowledge_collection_sources AS links JOIN knowledge_sources AS sources ON sources.id=links.source_id
                WHERE links.collection_id=knowledge_collections.id AND sources.kind='directory' ORDER BY links.created_at ASC LIMIT 1),
              (SELECT json_extract(value_json, '$') FROM knowledge_settings WHERE key='storageDirectory' LIMIT 1)) WHERE source_directory IS NULL`);
            break;
          case 25:
            add("provider_models", "thinking_json", "TEXT");
            break;
        }
      }
    }
    validateConfigSchema(db);
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("配置库外键校验失败");
    db.exec(`PRAGMA user_version=${CONFIG_SCHEMA_VERSION}; COMMIT`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys=ON");
  }
}
