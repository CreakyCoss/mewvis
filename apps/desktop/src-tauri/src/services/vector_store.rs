use rusqlite::{
    ffi::sqlite3_auto_extension, params, params_from_iter, Connection, OptionalExtension,
};
use sqlite_vec::sqlite3_vec_init;
use std::sync::Once;

const LEGACY_SQLITE_VEC_TABLE: &str = "rag_vec_chunks";
const SQLITE_VEC_TABLE_PREFIX: &str = "rag_vec_profile_";
const SQLITE_VEC_BACKEND_ID: &str = "sqlite-vec";

static REGISTER_SQLITE_VEC: Once = Once::new();

#[derive(Debug, Clone)]
pub struct VectorEmbedding {
    pub chunk_id: String,
    pub source_id: String,
    pub model_id: String,
    pub embedding_profile_id: String,
    pub dimensions: i64,
    pub vector: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct VectorSearchHit {
    pub chunk_id: String,
    pub score: f64,
}

pub trait KnowledgeVectorStore {
    fn backend_id(&self) -> &'static str;
    fn register(&self);
    fn ensure_schema(
        &self,
        conn: &Connection,
        embedding_profile_id: &str,
        model_id: &str,
        dimensions: i64,
    ) -> Result<(), String>;
    fn clear_all(&self, conn: &Connection) -> Result<(), String>;
    fn clear_source(&self, conn: &Connection, source_id: &str) -> Result<(), String>;
    fn insert_embeddings(
        &self,
        conn: &Connection,
        embeddings: &[VectorEmbedding],
    ) -> Result<(), String>;
    fn search(
        &self,
        conn: &Connection,
        embedding_profile_id: &str,
        model_id: &str,
        query_vector: &[f32],
        source_ids: &[String],
        max_results: usize,
    ) -> Result<Vec<VectorSearchHit>, String>;
}

pub struct SqliteVecStore;

impl KnowledgeVectorStore for SqliteVecStore {
    fn backend_id(&self) -> &'static str {
        SQLITE_VEC_BACKEND_ID
    }

    fn register(&self) {
        REGISTER_SQLITE_VEC.call_once(|| unsafe {
            sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
        });
    }

    fn ensure_schema(
        &self,
        conn: &Connection,
        embedding_profile_id: &str,
        model_id: &str,
        dimensions: i64,
    ) -> Result<(), String> {
        if embedding_profile_id.trim().is_empty() || model_id.trim().is_empty() {
            return Err("Embedding 配置与模型 ID 不能为空".to_string());
        }
        if dimensions <= 0 {
            return Err("Embedding 维度必须大于 0".to_string());
        }

        let table_name = profile_vec_table(embedding_profile_id);
        let state = vector_state(conn, embedding_profile_id)?;
        if state.as_ref().is_some_and(|state| {
            state.model_id == model_id
                && state.table_name == table_name
                && state.dimensions == dimensions
        }) && table_exists(conn, &table_name)?
        {
            return Ok(());
        }

        if let Some(state) = state {
            drop_vec_table(conn, &state.table_name)?;
        } else {
            drop_vec_table(conn, &table_name)?;
        }
        conn.execute(
            "DELETE FROM rag_vector_entries WHERE embedding_profile_id = ?1",
            params![embedding_profile_id],
        )
        .map_err(|error| format!("无法清空模型向量索引映射：{error}"))?;
        conn.execute(
            "DELETE FROM rag_embeddings WHERE embedding_profile_id = ?1",
            params![embedding_profile_id],
        )
        .map_err(|error| format!("无法清空模型向量：{error}"))?;

        create_vec_table(conn, &table_name, dimensions)?;
        save_vector_state(
            conn,
            embedding_profile_id,
            model_id,
            &table_name,
            self.backend_id(),
            dimensions,
        )
    }

    fn clear_all(&self, conn: &Connection) -> Result<(), String> {
        for profile_id in vector_profile_ids(conn)? {
            drop_vec_table(conn, &profile_vec_table(&profile_id))?;
        }
        drop_vec_table(conn, LEGACY_SQLITE_VEC_TABLE)?;
        conn.execute("DELETE FROM rag_vector_entries", [])
            .map_err(|error| format!("无法清空向量索引映射：{error}"))?;
        conn.execute("DELETE FROM rag_vector_state", [])
            .map_err(|error| format!("无法清空向量索引状态：{error}"))?;
        Ok(())
    }

    fn clear_source(&self, conn: &Connection, source_id: &str) -> Result<(), String> {
        let mut statement = conn
            .prepare(
                r#"
                SELECT rowid, embedding_profile_id
                FROM rag_vector_entries
                WHERE source_id = ?1
                "#,
            )
            .map_err(|error| format!("无法读取知识源向量映射：{error}"))?;
        let entries = statement
            .query_map(params![source_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| format!("无法读取知识源向量映射：{error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("无法解析知识源向量映射：{error}"))?;

        for (rowid, profile_id) in entries {
            let table_name = profile_vec_table(&profile_id);
            if table_exists(conn, &table_name)? {
                conn.execute(
                    &format!("DELETE FROM {table_name} WHERE rowid = ?1"),
                    params![rowid],
                )
                .map_err(|error| format!("无法清空知识源 sqlite-vec 向量：{error}"))?;
            }
        }
        conn.execute(
            "DELETE FROM rag_vector_entries WHERE source_id = ?1",
            params![source_id],
        )
        .map_err(|error| format!("无法清空知识源向量映射：{error}"))?;
        Ok(())
    }

    fn insert_embeddings(
        &self,
        conn: &Connection,
        embeddings: &[VectorEmbedding],
    ) -> Result<(), String> {
        let Some(first) = embeddings.first() else {
            return Ok(());
        };
        self.ensure_schema(
            conn,
            &first.embedding_profile_id,
            &first.model_id,
            first.dimensions,
        )?;
        let table_name = profile_vec_table(&first.embedding_profile_id);
        let now = now_millis()?;

        for embedding in embeddings {
            if embedding.embedding_profile_id != first.embedding_profile_id
                || embedding.model_id != first.model_id
                || embedding.dimensions != first.dimensions
                || embedding.vector.len() != first.dimensions as usize
            {
                return Err("同一批次包含不一致的 Embedding 配置或向量维度".to_string());
            }
            let vector_json = vector_to_json(&embedding.vector)?;
            let vector_blob = vector_to_blob(&embedding.vector);
            let vector_norm = vector_norm(&embedding.vector);

            conn.execute(
                r#"
                INSERT OR REPLACE INTO rag_embeddings (
                    chunk_id, embedding_profile_id, model_id, dimensions,
                    vector, vector_norm, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
                params![
                    embedding.chunk_id,
                    embedding.embedding_profile_id,
                    embedding.model_id,
                    embedding.dimensions,
                    vector_blob,
                    vector_norm,
                    now
                ],
            )
            .map_err(|error| format!("无法写入知识库向量：{error}"))?;

            let existing_rowid = conn
                .query_row(
                    r#"
                    SELECT rowid
                    FROM rag_vector_entries
                    WHERE chunk_id = ?1
                      AND embedding_profile_id = ?2
                      AND model_id = ?3
                    "#,
                    params![
                        embedding.chunk_id,
                        embedding.embedding_profile_id,
                        embedding.model_id
                    ],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(|error| format!("无法读取向量索引映射：{error}"))?;
            let rowid = match existing_rowid {
                Some(rowid) => {
                    conn.execute(
                        r#"
                        UPDATE rag_vector_entries
                        SET source_id = ?2, backend = ?3, dimensions = ?4, created_at = ?5
                        WHERE rowid = ?1
                        "#,
                        params![
                            rowid,
                            embedding.source_id,
                            self.backend_id(),
                            first.dimensions,
                            now
                        ],
                    )
                    .map_err(|error| format!("无法更新向量索引映射：{error}"))?;
                    rowid
                }
                None => {
                    conn.execute(
                        r#"
                        INSERT INTO rag_vector_entries (
                            chunk_id, source_id, embedding_profile_id, model_id,
                            backend, dimensions, created_at
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                        "#,
                        params![
                            embedding.chunk_id,
                            embedding.source_id,
                            embedding.embedding_profile_id,
                            embedding.model_id,
                            self.backend_id(),
                            first.dimensions,
                            now
                        ],
                    )
                    .map_err(|error| format!("无法写入向量索引映射：{error}"))?;
                    conn.last_insert_rowid()
                }
            };

            conn.execute(
                &format!(
                    "INSERT OR REPLACE INTO {table_name}(rowid, source_id, chunk_id, embedding) VALUES (?1, ?2, ?3, ?4)"
                ),
                params![rowid, embedding.source_id, embedding.chunk_id, vector_json],
            )
            .map_err(|error| format!("无法写入 sqlite-vec 向量表：{error}"))?;
        }

        Ok(())
    }

    fn search(
        &self,
        conn: &Connection,
        embedding_profile_id: &str,
        model_id: &str,
        query_vector: &[f32],
        source_ids: &[String],
        max_results: usize,
    ) -> Result<Vec<VectorSearchHit>, String> {
        if source_ids.is_empty() || query_vector.is_empty() {
            return Ok(Vec::new());
        }
        let Some(state) = vector_state(conn, embedding_profile_id)? else {
            return Ok(Vec::new());
        };
        let table_name = profile_vec_table(embedding_profile_id);
        if state.model_id != model_id
            || state.table_name != table_name
            || state.dimensions != query_vector.len() as i64
            || !table_exists(conn, &state.table_name)?
        {
            return Ok(Vec::new());
        }

        let k = (max_results.max(1) * 40).clamp(max_results.max(1), 800);
        let placeholders = placeholders(source_ids.len());
        let sql = format!(
            r#"
            WITH vector_matches AS (
                SELECT rowid, distance
                FROM {table_name}
                WHERE embedding MATCH ?1
                  AND k = ?2
            )
            SELECT entries.chunk_id, vector_matches.distance
            FROM vector_matches
            JOIN rag_vector_entries AS entries ON entries.rowid = vector_matches.rowid
            WHERE entries.embedding_profile_id = ?3
              AND entries.model_id = ?4
              AND entries.source_id IN ({placeholders})
            ORDER BY vector_matches.distance ASC
            LIMIT {max_results}
            "#
        );

        let mut query_params = vec![
            rusqlite::types::Value::from(vector_to_json(query_vector)?),
            rusqlite::types::Value::from(k as i64),
            rusqlite::types::Value::from(embedding_profile_id.to_string()),
            rusqlite::types::Value::from(model_id.to_string()),
        ];
        query_params.extend(source_ids.iter().cloned().map(rusqlite::types::Value::from));

        let mut statement = conn
            .prepare(&sql)
            .map_err(|error| format!("无法准备 sqlite-vec 检索：{error}"))?;
        let rows = statement
            .query_map(params_from_iter(query_params), |row| {
                let distance = row.get::<_, f64>(1)?;
                Ok(VectorSearchHit {
                    chunk_id: row.get(0)?,
                    score: 1.0 / (1.0 + distance.max(0.0)),
                })
            })
            .map_err(|error| format!("无法执行 sqlite-vec 检索：{error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("无法解析 sqlite-vec 检索结果：{error}"))
    }
}

pub fn default_vector_store() -> Box<dyn KnowledgeVectorStore> {
    Box::new(SqliteVecStore)
}

pub fn initialize_vector_metadata_schema(conn: &Connection) -> Result<(), String> {
    let state_columns = table_columns(conn, "rag_vector_state")?;
    let has_legacy_schema = !state_columns.is_empty()
        && (!state_columns.iter().any(|column| column == "profile_id")
            || !state_columns.iter().any(|column| column == "model_id")
            || !state_columns.iter().any(|column| column == "table_name"));
    if has_legacy_schema {
        drop_vec_table(conn, LEGACY_SQLITE_VEC_TABLE)?;
        conn.execute_batch(
            r#"
            DROP TABLE IF EXISTS rag_vector_entries;
            DROP TABLE IF EXISTS rag_vector_state;
            DELETE FROM rag_embeddings;
            "#,
        )
        .map_err(|error| format!("无法迁移多模型向量索引结构：{error}"))?;
    }

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS rag_vector_entries (
            rowid INTEGER PRIMARY KEY AUTOINCREMENT,
            chunk_id TEXT NOT NULL,
            source_id TEXT NOT NULL,
            embedding_profile_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            backend TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE(chunk_id, embedding_profile_id, model_id)
        );

        CREATE TABLE IF NOT EXISTS rag_vector_state (
            profile_id TEXT PRIMARY KEY,
            model_id TEXT NOT NULL,
            table_name TEXT NOT NULL UNIQUE,
            backend TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        "#,
    )
    .map_err(|error| format!("无法初始化向量索引结构：{error}"))
}

#[derive(Debug)]
struct VectorState {
    model_id: String,
    table_name: String,
    dimensions: i64,
}

fn vector_state(conn: &Connection, profile_id: &str) -> Result<Option<VectorState>, String> {
    conn.query_row(
        r#"
        SELECT model_id, table_name, dimensions
        FROM rag_vector_state
        WHERE profile_id = ?1
        "#,
        params![profile_id],
        |row| {
            Ok(VectorState {
                model_id: row.get(0)?,
                table_name: row.get(1)?,
                dimensions: row.get(2)?,
            })
        },
    )
    .optional()
    .map_err(|error| format!("无法读取向量索引状态：{error}"))
}

fn vector_profile_ids(conn: &Connection) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare("SELECT profile_id FROM rag_vector_state")
        .map_err(|error| format!("无法读取向量索引配置：{error}"))?;
    let profile_ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取向量索引配置：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析向量索引配置：{error}"))?;
    Ok(profile_ids)
}

fn save_vector_state(
    conn: &Connection,
    profile_id: &str,
    model_id: &str,
    table_name: &str,
    backend: &str,
    dimensions: i64,
) -> Result<(), String> {
    let now = now_millis()?;
    conn.execute(
        r#"
        INSERT INTO rag_vector_state (
            profile_id, model_id, table_name, backend, dimensions, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(profile_id) DO UPDATE SET
            model_id = excluded.model_id,
            table_name = excluded.table_name,
            backend = excluded.backend,
            dimensions = excluded.dimensions,
            updated_at = excluded.updated_at
        "#,
        params![profile_id, model_id, table_name, backend, dimensions, now],
    )
    .map_err(|error| format!("无法保存向量索引状态：{error}"))?;
    Ok(())
}

fn create_vec_table(conn: &Connection, table_name: &str, dimensions: i64) -> Result<(), String> {
    conn.execute_batch(&format!(
        r#"
        CREATE VIRTUAL TABLE {table_name}
        USING vec0(
            source_id TEXT,
            chunk_id TEXT,
            embedding float[{dimensions}] distance_metric=cosine
        );
        "#
    ))
    .map_err(|error| format!("无法创建 sqlite-vec 向量表：{error}"))
}

fn drop_vec_table(conn: &Connection, table_name: &str) -> Result<(), String> {
    if !is_safe_vec_table_name(table_name) || !table_exists(conn, table_name)? {
        return Ok(());
    }
    conn.execute_batch(&format!("DROP TABLE {table_name};"))
        .map_err(|error| format!("无法删除 sqlite-vec 向量表：{error}"))
}

fn table_exists(conn: &Connection, table_name: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![table_name],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value == 1)
    .map_err(|error| format!("无法读取向量表状态：{error}"))
}

fn table_columns(conn: &Connection, table_name: &str) -> Result<Vec<String>, String> {
    if !matches!(table_name, "rag_vector_state" | "rag_vector_entries") {
        return Err("无法读取未知向量表结构".to_string());
    }
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table_name})"))
        .map_err(|error| format!("无法读取向量表结构：{error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("无法读取向量表字段：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析向量表字段：{error}"))?;
    Ok(columns)
}

fn profile_vec_table(profile_id: &str) -> String {
    let encoded = profile_id
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("{SQLITE_VEC_TABLE_PREFIX}{encoded}")
}

fn is_safe_vec_table_name(table_name: &str) -> bool {
    table_name == LEGACY_SQLITE_VEC_TABLE
        || table_name
            .strip_prefix(SQLITE_VEC_TABLE_PREFIX)
            .is_some_and(|suffix| {
                !suffix.is_empty()
                    && suffix.len() % 2 == 0
                    && suffix
                        .chars()
                        .all(|character| character.is_ascii_hexdigit())
            })
}

fn vector_to_json(vector: &[f32]) -> Result<String, String> {
    if vector.iter().any(|value| !value.is_finite()) {
        return Err("Embedding 向量包含无效数值".to_string());
    }
    serde_json::to_string(vector).map_err(|error| format!("无法序列化 Embedding 向量：{error}"))
}

fn vector_to_blob(vector: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(std::mem::size_of_val(vector));
    for value in vector {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

fn vector_norm(vector: &[f32]) -> f64 {
    vector
        .iter()
        .map(|value| f64::from(*value) * f64::from(*value))
        .sum::<f64>()
        .sqrt()
}

fn placeholders(count: usize) -> String {
    (0..count).map(|_| "?").collect::<Vec<_>>().join(", ")
}

fn now_millis() -> Result<i64, String> {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{error}"))?;
    Ok(duration.as_millis() as i64)
}

#[cfg(test)]
mod tests {
    use super::{
        initialize_vector_metadata_schema, is_safe_vec_table_name, profile_vec_table,
        KnowledgeVectorStore, SqliteVecStore, VectorEmbedding,
    };
    use rusqlite::Connection;

    #[test]
    fn profile_table_name_is_safe_and_stable() {
        let table_name = profile_vec_table("profile-1");
        assert_eq!(table_name, "rag_vec_profile_70726f66696c652d31");
        assert!(is_safe_vec_table_name(&table_name));
        assert!(!is_safe_vec_table_name("rag_vec_profile_x; DROP TABLE x"));
    }

    #[test]
    fn different_profiles_can_use_different_vector_dimensions() {
        let store = SqliteVecStore;
        store.register();
        let conn = Connection::open_in_memory().expect("open vector database");
        conn.execute_batch(
            r#"
            CREATE TABLE rag_embeddings (
                chunk_id TEXT NOT NULL,
                embedding_profile_id TEXT NOT NULL,
                model_id TEXT NOT NULL,
                dimensions INTEGER NOT NULL,
                vector BLOB NOT NULL,
                vector_norm REAL NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(chunk_id, embedding_profile_id, model_id)
            );
            "#,
        )
        .expect("create embeddings table");
        initialize_vector_metadata_schema(&conn).expect("create vector metadata");

        store
            .insert_embeddings(
                &conn,
                &[VectorEmbedding {
                    chunk_id: "chunk-a".to_string(),
                    source_id: "source-a".to_string(),
                    model_id: "model-a".to_string(),
                    embedding_profile_id: "profile-a".to_string(),
                    dimensions: 2,
                    vector: vec![1.0, 0.0],
                }],
            )
            .expect("insert profile a vector");
        store
            .insert_embeddings(
                &conn,
                &[VectorEmbedding {
                    chunk_id: "chunk-b".to_string(),
                    source_id: "source-b".to_string(),
                    model_id: "model-b".to_string(),
                    embedding_profile_id: "profile-b".to_string(),
                    dimensions: 3,
                    vector: vec![0.0, 1.0, 0.0],
                }],
            )
            .expect("insert profile b vector");

        let hits_a = store
            .search(
                &conn,
                "profile-a",
                "model-a",
                &[1.0, 0.0],
                &["source-a".to_string()],
                4,
            )
            .expect("search profile a");
        let hits_b = store
            .search(
                &conn,
                "profile-b",
                "model-b",
                &[0.0, 1.0, 0.0],
                &["source-b".to_string()],
                4,
            )
            .expect("search profile b");

        assert_eq!(hits_a[0].chunk_id, "chunk-a");
        assert_eq!(hits_b[0].chunk_id, "chunk-b");
    }
}
