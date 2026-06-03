use rusqlite::{ffi::sqlite3_auto_extension, params, params_from_iter, Connection};
use sqlite_vec::sqlite3_vec_init;
use std::sync::Once;

const SQLITE_VEC_TABLE: &str = "rag_vec_chunks";
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
    fn ensure_schema(&self, conn: &Connection, dimensions: i64) -> Result<(), String>;
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

    fn ensure_schema(&self, conn: &Connection, dimensions: i64) -> Result<(), String> {
        if dimensions <= 0 {
            return Err("Embedding 维度必须大于 0".to_string());
        }

        let current_dimensions = vector_dimensions(conn)?;
        if current_dimensions != Some(dimensions) {
            drop_vec_table_if_exists(conn)?;
            create_vec_table(conn, dimensions)?;
            save_vector_state(conn, self.backend_id(), dimensions)?;
        }
        Ok(())
    }

    fn clear_all(&self, conn: &Connection) -> Result<(), String> {
        if vec_table_exists(conn)? {
            conn.execute(&format!("DELETE FROM {SQLITE_VEC_TABLE}"), [])
                .map_err(|error| format!("无法清空 sqlite-vec 向量表：{error}"))?;
        }
        conn.execute("DELETE FROM rag_vector_entries", [])
            .map_err(|error| format!("无法清空向量索引映射：{error}"))?;
        Ok(())
    }

    fn clear_source(&self, conn: &Connection, source_id: &str) -> Result<(), String> {
        if vec_table_exists(conn)? {
            let mut statement = conn
                .prepare("SELECT rowid FROM rag_vector_entries WHERE source_id = ?1")
                .map_err(|error| format!("无法读取知识源向量映射：{error}"))?;
            let rowids = statement
                .query_map(params![source_id], |row| row.get::<_, i64>(0))
                .map_err(|error| format!("无法读取知识源向量映射：{error}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("无法解析知识源向量映射：{error}"))?;
            for rowid in rowids {
                conn.execute(
                    &format!("DELETE FROM {SQLITE_VEC_TABLE} WHERE rowid = ?1"),
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
        if embeddings.is_empty() {
            return Ok(());
        }

        let dimensions = embeddings[0].dimensions;
        self.ensure_schema(conn, dimensions)?;
        let now = now_millis()?;

        for embedding in embeddings {
            if embedding.dimensions != dimensions || embedding.vector.len() != dimensions as usize {
                return Err("Embedding 维度与向量库维度不一致".to_string());
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
                    dimensions,
                    vector_blob,
                    vector_norm,
                    now
                ],
            )
            .map_err(|error| format!("无法写入知识库向量：{error}"))?;

            let existing_rowid = conn
                .query_row(
                    "SELECT rowid FROM rag_vector_entries WHERE chunk_id = ?1",
                    params![embedding.chunk_id],
                    |row| row.get::<_, i64>(0),
                )
                .ok();
            let rowid = match existing_rowid {
                Some(rowid) => {
                    conn.execute(
                        r#"
                        UPDATE rag_vector_entries
                        SET source_id = ?2,
                            embedding_profile_id = ?3,
                            model_id = ?4,
                            backend = ?5,
                            dimensions = ?6,
                            created_at = ?7
                        WHERE rowid = ?1
                        "#,
                        params![
                            rowid,
                            embedding.source_id,
                            embedding.embedding_profile_id,
                            embedding.model_id,
                            self.backend_id(),
                            dimensions,
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
                            dimensions,
                            now
                        ],
                    )
                    .map_err(|error| format!("无法写入向量索引映射：{error}"))?;
                    conn.last_insert_rowid()
                }
            };

            conn.execute(
                &format!(
                    "INSERT OR REPLACE INTO {SQLITE_VEC_TABLE}(rowid, source_id, chunk_id, embedding) VALUES (?1, ?2, ?3, ?4)"
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
        query_vector: &[f32],
        source_ids: &[String],
        max_results: usize,
    ) -> Result<Vec<VectorSearchHit>, String> {
        if source_ids.is_empty() || query_vector.is_empty() || !vec_table_exists(conn)? {
            return Ok(Vec::new());
        }

        let k = (max_results.max(1) * 40).clamp(max_results.max(1), 800);
        let placeholders = placeholders(source_ids.len());
        let sql = format!(
            r#"
            WITH vector_matches AS (
                SELECT rowid, distance
                FROM {SQLITE_VEC_TABLE}
                WHERE embedding MATCH ?1
                  AND k = ?2
            )
            SELECT entries.chunk_id, vector_matches.distance
            FROM vector_matches
            JOIN rag_vector_entries AS entries ON entries.rowid = vector_matches.rowid
            WHERE entries.source_id IN ({placeholders})
            ORDER BY vector_matches.distance ASC
            LIMIT {max_results}
            "#
        );

        let mut query_params = vec![rusqlite::types::Value::from(vector_to_json(query_vector)?)];
        query_params.push(rusqlite::types::Value::from(k as i64));
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
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS rag_vector_entries (
            rowid INTEGER PRIMARY KEY AUTOINCREMENT,
            chunk_id TEXT NOT NULL UNIQUE,
            source_id TEXT NOT NULL,
            embedding_profile_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            backend TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rag_vector_state (
            id TEXT PRIMARY KEY,
            backend TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        "#,
    )
    .map_err(|error| format!("无法初始化向量索引结构：{error}"))
}

fn create_vec_table(conn: &Connection, dimensions: i64) -> Result<(), String> {
    conn.execute_batch(&format!(
        r#"
        CREATE VIRTUAL TABLE {SQLITE_VEC_TABLE}
        USING vec0(
            source_id TEXT,
            chunk_id TEXT,
            embedding float[{dimensions}] distance_metric=cosine
        );
        "#
    ))
    .map_err(|error| format!("无法创建 sqlite-vec 向量表：{error}"))
}

fn drop_vec_table_if_exists(conn: &Connection) -> Result<(), String> {
    if vec_table_exists(conn)? {
        conn.execute_batch(&format!("DROP TABLE {SQLITE_VEC_TABLE};"))
            .map_err(|error| format!("无法重建 sqlite-vec 向量表：{error}"))?;
    }
    conn.execute("DELETE FROM rag_vector_entries", [])
        .map_err(|error| format!("无法清空向量索引映射：{error}"))?;
    conn.execute("DELETE FROM rag_embeddings", [])
        .map_err(|error| format!("无法清空知识库向量：{error}"))?;
    Ok(())
}

fn vec_table_exists(conn: &Connection) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![SQLITE_VEC_TABLE],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value == 1)
    .map_err(|error| format!("无法读取 sqlite-vec 向量表：{error}"))
}

fn vector_dimensions(conn: &Connection) -> Result<Option<i64>, String> {
    conn.query_row(
        "SELECT dimensions FROM rag_vector_state WHERE id = 'default'",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(Some)
    .or_else(|error| {
        if matches!(error, rusqlite::Error::QueryReturnedNoRows) {
            Ok(None)
        } else {
            Err(format!("无法读取向量索引状态：{error}"))
        }
    })
}

fn save_vector_state(conn: &Connection, backend: &str, dimensions: i64) -> Result<(), String> {
    let now = now_millis()?;
    conn.execute(
        r#"
        INSERT INTO rag_vector_state (id, backend, dimensions, updated_at)
        VALUES ('default', ?1, ?2, ?3)
        ON CONFLICT(id) DO UPDATE SET
            backend = excluded.backend,
            dimensions = excluded.dimensions,
            updated_at = excluded.updated_at
        "#,
        params![backend, dimensions, now],
    )
    .map_err(|error| format!("无法保存向量索引状态：{error}"))?;
    Ok(())
}

fn vector_to_json(vector: &[f32]) -> Result<String, String> {
    if vector.iter().any(|value| !value.is_finite()) {
        return Err("Embedding 向量包含无效数值".to_string());
    }
    serde_json::to_string(vector).map_err(|error| format!("无法序列化 Embedding 向量：{error}"))
}

fn vector_to_blob(vector: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(vector.len() * std::mem::size_of::<f32>());
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
