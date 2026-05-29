use rusqlite::{params, Connection};
use tauri::AppHandle;

use super::{
    common::{normalize_optional_text, normalize_record_id, now_millis},
    connection::open_config_connection,
    inputs::SaveAiAgentInput,
    llm::ensure_provider_model_exists,
    models::{AiAgent, AiAgentSettings},
};

pub fn ai_agent_settings(app: &AppHandle) -> Result<AiAgentSettings, String> {
    let conn = open_config_connection(app)?;

    Ok(AiAgentSettings {
        agents: load_ai_agents(&conn)?,
    })
}

pub fn save_ai_agent(app: &AppHandle, input: SaveAiAgentInput) -> Result<AiAgentSettings, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Agent 名称不能为空".to_string());
    }

    let avatar = input.avatar.trim();
    if avatar.is_empty() {
        return Err("请选择 Agent 头像".to_string());
    }

    let provider_id = input.provider_id.trim();
    if provider_id.is_empty() {
        return Err("请选择 Agent 使用的 LLM".to_string());
    }

    let model_id = input.model_id.trim();
    if model_id.is_empty() {
        return Err("请选择 Agent 使用的模型".to_string());
    }

    let conn = open_config_connection(app)?;
    ensure_provider_model_exists(&conn, provider_id, model_id)?;

    let now = now_millis()?;
    let id = normalize_record_id(input.id.as_deref());
    let description = normalize_optional_text(input.description.as_deref());
    let exists = agent_exists(&conn, &id)?;

    if exists {
        conn.execute(
            r#"
            UPDATE ai_agents
            SET name = ?2, avatar = ?3, description = ?4, provider_id = ?5, model_id = ?6, updated_at = ?7
            WHERE id = ?1
            "#,
            params![id, name, avatar, description, provider_id, model_id, now],
        )
        .map_err(|error| format!("无法更新 Agent：{error}"))?;
    } else {
        conn.execute(
            r#"
            INSERT INTO ai_agents (
                id, name, avatar, description, provider_id, model_id, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                id,
                name,
                avatar,
                description,
                provider_id,
                model_id,
                now,
                now
            ],
        )
        .map_err(|error| format!("无法保存 Agent：{error}"))?;
    }

    ai_agent_settings(app)
}

pub fn delete_ai_agent(app: &AppHandle, id: &str) -> Result<AiAgentSettings, String> {
    let id = id.trim();
    if id.is_empty() {
        return Err("Agent ID 不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    conn.execute("DELETE FROM ai_agents WHERE id = ?1", params![id])
        .map_err(|error| format!("无法删除 Agent：{error}"))?;

    ai_agent_settings(app)
}

fn load_ai_agents(conn: &Connection) -> Result<Vec<AiAgent>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, name, avatar, description, provider_id, model_id, created_at, updated_at
            FROM ai_agents
            ORDER BY created_at ASC
            "#,
        )
        .map_err(|error| format!("无法读取 Agent：{error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(AiAgent {
                id: row.get(0)?,
                name: row.get(1)?,
                avatar: row.get(2)?,
                description: row.get(3)?,
                provider_id: row.get(4)?,
                model_id: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("无法读取 Agent：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 Agent：{error}"))
}

fn agent_exists(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM ai_agents WHERE id = ?1)",
        params![id],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value == 1)
    .map_err(|error| format!("无法读取 Agent：{error}"))
}
