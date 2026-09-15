import { basename } from "node:path";
import type { ConfigDatabase } from "../../storage/config/database.js";
import { recordId } from "../../shared/record-id.js";
import {
  nonempty,
  optionalString,
  ServiceError,
  type JsonObject,
  invalid,
} from "../../shared/validation.js";

const opt = (i: JsonObject, key: string) => optionalString(i[key], key) ?? null;
const camel = (row: any): any =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      k === "enabled" ? !!v : v,
    ]),
  );
export class KnowledgeRepository {
  constructor(private database: ConfigDatabase) {}
  private get db() {
    return this.database.connection;
  }
  library() {
    const sources = this.db
      .prepare("SELECT * FROM knowledge_sources ORDER BY created_at,title")
      .all()
      .map(camel);
    const collections = this.db
      .prepare(
        'SELECT * FROM knowledge_collections ORDER BY "order",created_at',
      )
      .all()
      .map((r) => ({
        ...camel(r),
        sourceIds: this.db
          .prepare(
            "SELECT source_id FROM knowledge_collection_sources WHERE collection_id=? ORDER BY created_at,source_id",
          )
          .all(r.id)
          .map((r) => r.source_id),
      }));
    return { sources, collections };
  }
  profiles() {
    return this.db
      .prepare(
        "SELECT id,name,provider_kind,base_url,api_key,model_id,dimensions,batch_size,created_at,updated_at,(SELECT COUNT(*) FROM knowledge_collections WHERE embedding_profile_id=embedding_profiles.id) AS knowledge_base_count FROM embedding_profiles ORDER BY created_at",
      )
      .all()
      .map(camel);
  }
  collection(id: unknown) {
    const c = this.library().collections.find(
      (c) => c.id === nonempty(id, "collectionId"),
    );
    if (!c) throw new ServiceError(404, "NOT_FOUND", "知识库不存在");
    return c;
  }
  profile(id: unknown) {
    const p = this.profiles().find((p) => p.id === nonempty(id, "profileId"));
    if (!p) throw new ServiceError(404, "NOT_FOUND", "Embedding 配置不存在");
    return p;
  }
  saveProfile(i: JsonObject) {
    const kind = nonempty(i.providerKind, "providerKind");
    if (
      ![
        "openai",
        "openai-compatible",
        "openai-responses",
        "openai-completions",
        "ollama",
      ].includes(kind)
    )
      invalid("不支持的 Embedding Provider");
    if (
      !Number.isSafeInteger(i.dimensions) ||
      Number(i.dimensions) <= 0 ||
      Number(i.dimensions) > 65536
    )
      invalid("dimensions 必须是 1–65536 的整数");
    const batch = i.batchSize ?? 32;
    if (!Number.isSafeInteger(batch)) invalid("batchSize 必须是整数");
    this.db
      .prepare(
        `INSERT INTO embedding_profiles(id,name,provider_kind,base_url,api_key,model_id,dimensions,batch_size,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,provider_kind=excluded.provider_kind,base_url=excluded.base_url,api_key=excluded.api_key,model_id=excluded.model_id,dimensions=excluded.dimensions,batch_size=excluded.batch_size,updated_at=excluded.updated_at`,
      )
      .run(
        recordId(i.id),
        nonempty(i.name, "name"),
        kind,
        opt(i, "baseUrl"),
        kind === "ollama" ? null : opt(i, "apiKey"),
        nonempty(i.modelId, "modelId"),
        Number(i.dimensions),
        Math.min(256, Math.max(1, Number(batch))),
        Date.now(),
        Date.now(),
      );
    return this.profiles();
  }
  deleteProfile(id: unknown) {
    const p = this.profile(id);
    this.db.prepare("DELETE FROM embedding_profiles WHERE id=?").run(p.id);
    return this.profiles();
  }
  settings() {
    const raw = this.db
      .prepare(
        "SELECT value_json FROM knowledge_settings WHERE key='storageDirectory'",
      )
      .get()?.value_json;
    return { storageDirectory: raw ? JSON.parse(String(raw)) : null };
  }
  saveSettings(directory: string | null) {
    if (directory)
      this.db
        .prepare(
          "INSERT INTO knowledge_settings (key,value_json,updated_at) VALUES('storageDirectory',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",
        )
        .run(JSON.stringify(directory), Date.now());
    else
      this.db.exec(
        "DELETE FROM knowledge_settings WHERE key='storageDirectory'",
      );
    return this.settings();
  }
  saveCollection(i: JsonObject, directory: string) {
    return this.database.transaction(() => {
      const id = recordId(i.id),
        profile = opt(i, "embeddingProfileId"),
        now = Date.now();
      if (profile) this.profile(profile);
      if (typeof i.enabled !== "boolean") invalid("enabled 必须是布尔值");
      if (i.order != null && !Number.isSafeInteger(i.order))
        invalid("order 必须是整数");
      const conflict = this.db
        .prepare(
          "SELECT id FROM knowledge_collections WHERE source_directory=? AND id<>?",
        )
        .get(directory, id);
      if (conflict)
        throw new ServiceError(409, "CONFLICT", "该目录已被其他知识库使用");
      this.db
        .prepare(
          `INSERT INTO knowledge_collections (id,name,description,source_directory,color,\"order\",enabled,embedding_profile_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,source_directory=excluded.source_directory,color=excluded.color,"order"=excluded."order",enabled=excluded.enabled,embedding_profile_id=excluded.embedding_profile_id,updated_at=excluded.updated_at`,
        )
        .run(
          id,
          nonempty(i.name, "name"),
          opt(i, "description"),
          directory,
          opt(i, "color"),
          Number(i.order ?? 0),
          i.enabled ? 1 : 0,
          profile,
          now,
          now,
        );
      if (
        !this.db
          .prepare(
            "SELECT 1 FROM knowledge_collection_sources l JOIN knowledge_sources s ON s.id=l.source_id WHERE l.collection_id=? AND s.kind='directory' AND s.uri=?",
          )
          .get(id, directory)
      ) {
        const old = this.db
          .prepare(
            "SELECT source_id FROM knowledge_collection_sources WHERE collection_id=?",
          )
          .all(id);
        this.db
          .prepare(
            "DELETE FROM knowledge_collection_sources WHERE collection_id=?",
          )
          .run(id);
        const source =
          this.db
            .prepare(
              "SELECT id FROM knowledge_sources WHERE kind='directory' AND uri=?",
            )
            .get(directory)?.id ?? recordId(undefined);
        this.db
          .prepare(
            `INSERT INTO knowledge_sources (id,kind,uri,title,description,enabled,include_patterns_json,exclude_patterns_json,metadata_json,created_at,updated_at) VALUES(?,'directory',?,?,NULL,1,NULL,NULL,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=1,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`,
          )
          .run(
            source,
            directory,
            basename(directory),
            JSON.stringify({ collectionId: id }),
            now,
            now,
          );
        this.db
          .prepare(
            "INSERT INTO knowledge_collection_sources (collection_id,source_id,created_at) VALUES(?,?,?)",
          )
          .run(id, source, now);
        this.orphans(old.map((r) => String(r.source_id)));
      }
      return this.library();
    });
  }
  private orphans(ids: string[]) {
    for (const id of ids)
      this.db
        .prepare(
          "DELETE FROM knowledge_sources WHERE id=? AND NOT EXISTS(SELECT 1 FROM knowledge_collection_sources WHERE source_id=?)",
        )
        .run(id, id);
  }
  deleteCollection(id: unknown) {
    const c = this.collection(id);
    return this.database.transaction(() => {
      this.db.prepare("DELETE FROM knowledge_collections WHERE id=?").run(c.id);
      this.orphans(c.sourceIds as string[]);
      return this.library();
    });
  }
  saveSource(i: JsonObject, uri: string) {
    if (typeof i.enabled !== "boolean") invalid("enabled 必须是布尔值");
    this.db
      .prepare(
        `INSERT INTO knowledge_sources (id,kind,uri,title,description,enabled,include_patterns_json,exclude_patterns_json,metadata_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,uri=excluded.uri,title=excluded.title,description=excluded.description,enabled=excluded.enabled,include_patterns_json=excluded.include_patterns_json,exclude_patterns_json=excluded.exclude_patterns_json,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`,
      )
      .run(
        recordId(i.id),
        nonempty(i.kind, "kind"),
        uri,
        nonempty(i.title, "title"),
        opt(i, "description"),
        i.enabled ? 1 : 0,
        opt(i, "includePatternsJson"),
        opt(i, "excludePatternsJson"),
        opt(i, "metadataJson"),
        Date.now(),
        Date.now(),
      );
    return this.library();
  }
  deleteSource(id: unknown) {
    this.db
      .prepare("DELETE FROM knowledge_sources WHERE id=?")
      .run(nonempty(id, "sourceId"));
    return this.library();
  }
  setSources(i: JsonObject) {
    const c = this.collection(i.collectionId);
    if (!Array.isArray(i.sourceIds)) invalid("sourceIds 必须是数组");
    const ids = [...new Set(i.sourceIds.map((v) => nonempty(v, "sourceId")))];
    for (const id of ids)
      if (
        !this.db.prepare("SELECT id FROM knowledge_sources WHERE id=?").get(id)
      )
        invalid("知识源不存在");
    return this.database.transaction(() => {
      this.db
        .prepare(
          "DELETE FROM knowledge_collection_sources WHERE collection_id=?",
        )
        .run(c.id);
      for (const id of ids)
        this.db
          .prepare(
            "INSERT INTO knowledge_collection_sources (collection_id,source_id,created_at) VALUES(?,?,?)",
          )
          .run(c.id, id, Date.now());
      return this.library();
    });
  }
  setProfile(i: JsonObject) {
    const c = this.collection(i.collectionId),
      p = this.profile(i.embeddingProfileId);
    this.db
      .prepare(
        "UPDATE knowledge_collections SET embedding_profile_id=?,updated_at=? WHERE id=?",
      )
      .run(p.id, Date.now(), c.id);
    return this.library();
  }
}
