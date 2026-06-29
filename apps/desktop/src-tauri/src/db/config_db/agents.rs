use rusqlite::{params, Connection};
use tauri::AppHandle;

use super::{
    common::{normalize_optional_text, normalize_record_id, now_millis},
    connection::open_config_connection,
    inputs::{
        SaveAiAgentInput, SaveCollaborationWorkflowInput, SaveCollaborationWorkflowStepInput,
    },
    models::{
        AiAgent, AiAgentSettings, CollaborationWorkflow, CollaborationWorkflowStep,
        CollaborationWorkflowStepRecord,
    },
};

pub fn ai_agent_settings(app: &AppHandle) -> Result<AiAgentSettings, String> {
    let conn = open_config_connection(app)?;

    Ok(AiAgentSettings {
        agents: load_ai_agents(&conn)?,
        collaboration_workflows: load_collaboration_workflows(&conn)?,
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

    let conn = open_config_connection(app)?;

    let now = now_millis()?;
    let id = normalize_record_id(input.id.as_deref());
    let description = normalize_optional_text(input.description.as_deref());
    let exists = agent_exists(&conn, &id)?;

    if exists {
        conn.execute(
            r#"
            UPDATE ai_agents
            SET name = ?2, avatar = ?3, description = ?4, updated_at = ?5
            WHERE id = ?1
            "#,
            params![id, name, avatar, description, now],
        )
        .map_err(|error| format!("无法更新 Agent：{error}"))?;
    } else {
        conn.execute(
            r#"
            INSERT INTO ai_agents (
                id, name, avatar, description, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![id, name, avatar, description, now, now],
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

pub fn save_collaboration_workflow(
    app: &AppHandle,
    input: SaveCollaborationWorkflowInput,
) -> Result<AiAgentSettings, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("协作流程名称不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    let now = now_millis()?;
    let id = normalize_record_id(input.id.as_deref());
    let description = normalize_optional_text(input.description.as_deref());
    let draft_instruction = normalize_optional_text(input.draft_instruction.as_deref());
    let review_instruction = normalize_optional_text(input.review_instruction.as_deref());
    let revise_instruction = normalize_optional_text(input.revise_instruction.as_deref());
    let steps = normalize_workflow_steps(input.steps)?;
    let writer_agent_id = steps
        .first()
        .map(|step| step.agent_id.as_str())
        .unwrap_or_default();
    let reviewer_agent_id = steps
        .iter()
        .skip(1)
        .find(|step| step.agent_id != writer_agent_id)
        .or_else(|| steps.get(1))
        .or_else(|| steps.first())
        .map(|step| step.agent_id.as_str())
        .unwrap_or(writer_agent_id);
    let steps_json =
        serde_json::to_string(&steps).map_err(|error| format!("无法保存协作流程步骤：{error}"))?;
    let exists = collaboration_workflow_exists(&conn, &id)?;

    if exists {
        conn.execute(
            r#"
            UPDATE collaboration_workflows
            SET name = ?2,
                description = ?3,
                writer_agent_id = ?4,
                reviewer_agent_id = ?5,
                draft_instruction = ?6,
                review_instruction = ?7,
                revise_instruction = ?8,
                steps_json = ?9,
                updated_at = ?10
            WHERE id = ?1
            "#,
            params![
                id,
                name,
                description,
                writer_agent_id,
                reviewer_agent_id,
                draft_instruction,
                review_instruction,
                revise_instruction,
                steps_json,
                now
            ],
        )
        .map_err(|error| format!("无法更新协作流程：{error}"))?;
    } else {
        conn.execute(
            r#"
            INSERT INTO collaboration_workflows (
                id,
                name,
                description,
                writer_agent_id,
                reviewer_agent_id,
                draft_instruction,
                review_instruction,
                revise_instruction,
                steps_json,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                id,
                name,
                description,
                writer_agent_id,
                reviewer_agent_id,
                draft_instruction,
                review_instruction,
                revise_instruction,
                steps_json,
                now,
                now
            ],
        )
        .map_err(|error| format!("无法保存协作流程：{error}"))?;
    }

    ai_agent_settings(app)
}

pub fn delete_collaboration_workflow(app: &AppHandle, id: &str) -> Result<AiAgentSettings, String> {
    let id = id.trim();
    if id.is_empty() {
        return Err("协作流程 ID 不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    conn.execute(
        "DELETE FROM collaboration_workflows WHERE id = ?1",
        params![id],
    )
    .map_err(|error| format!("无法删除协作流程：{error}"))?;

    ai_agent_settings(app)
}

fn load_ai_agents(conn: &Connection) -> Result<Vec<AiAgent>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, name, avatar, description, created_at, updated_at
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
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|error| format!("无法读取 Agent：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 Agent：{error}"))
}

fn load_collaboration_workflows(conn: &Connection) -> Result<Vec<CollaborationWorkflow>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT
                id,
                name,
                description,
                writer_agent_id,
                reviewer_agent_id,
                draft_instruction,
                review_instruction,
                revise_instruction,
                steps_json,
                created_at,
                updated_at
            FROM collaboration_workflows
            ORDER BY created_at ASC
            "#,
        )
        .map_err(|error| format!("无法读取协作流程：{error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(CollaborationWorkflow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                writer_agent_id: row.get(3)?,
                reviewer_agent_id: row.get(4)?,
                draft_instruction: row.get(5)?,
                review_instruction: row.get(6)?,
                revise_instruction: row.get(7)?,
                steps: collaboration_workflow_steps_from_row(row.get::<_, Option<String>>(8)?)
                    .map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            8,
                            rusqlite::types::Type::Text,
                            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
                        )
                    })?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|error| format!("无法读取协作流程：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析协作流程：{error}"))
}

fn normalize_workflow_steps(
    steps: Option<Vec<SaveCollaborationWorkflowStepInput>>,
) -> Result<Vec<CollaborationWorkflowStepRecord>, String> {
    let normalized_steps = steps
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, step)| {
            let name = step.name.trim().to_string();
            if name.is_empty() {
                return Err(format!("第 {} 个协作步骤名称不能为空", index + 1));
            }

            let agent_id = step.agent_id.trim().to_string();
            if agent_id.is_empty() {
                return Err(format!("请选择第 {} 个协作步骤的 Agent", index + 1));
            }

            Ok(CollaborationWorkflowStepRecord {
                id: normalize_record_id(step.id.as_deref()),
                name,
                agent_id,
                instruction: normalize_optional_text(step.instruction.as_deref()),
                phase: normalize_optional_text(step.phase.as_deref()),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    if normalized_steps.is_empty() {
        return Err("请至少配置一个协作步骤".to_string());
    }

    Ok(normalized_steps)
}

fn collaboration_workflow_steps_from_row(
    steps_json: Option<String>,
) -> Result<Vec<CollaborationWorkflowStep>, String> {
    if let Some(steps_json) = steps_json.filter(|value| !value.trim().is_empty()) {
        let steps = serde_json::from_str::<Vec<CollaborationWorkflowStepRecord>>(&steps_json)
            .map_err(|error| format!("无法解析协作流程步骤：{error}"))?
            .into_iter()
            .filter(|step| !step.name.trim().is_empty() && !step.agent_id.trim().is_empty())
            .map(|step| CollaborationWorkflowStep {
                id: step.id,
                name: step.name,
                agent_id: step.agent_id,
                instruction: step.instruction,
                phase: step.phase,
            })
            .collect::<Vec<_>>();

        if !steps.is_empty() {
            return Ok(steps);
        }
    }

    Ok(Vec::new())
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

fn collaboration_workflow_exists(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM collaboration_workflows WHERE id = ?1)",
        params![id],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value == 1)
    .map_err(|error| format!("无法读取协作流程：{error}"))
}
