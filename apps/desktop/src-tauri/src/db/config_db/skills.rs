use rusqlite::{params, Connection};
use std::collections::BTreeSet;
use tauri::AppHandle;

use super::{
    common::now_millis, connection::open_config_connection, inputs::SaveWorkspaceSkillsInput,
    models::WorkspaceSkillSettings, workspace::ensure_workspace_exists,
};

pub fn workspace_skill_settings(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<WorkspaceSkillSettings, String> {
    let conn = open_config_connection(app)?;
    ensure_workspace_exists(&conn, workspace_id)?;

    Ok(WorkspaceSkillSettings {
        enabled_skill_names: load_workspace_skill_names(&conn, workspace_id)?,
    })
}

pub fn save_workspace_skill_settings(
    app: &AppHandle,
    input: SaveWorkspaceSkillsInput,
) -> Result<WorkspaceSkillSettings, String> {
    let workspace_id = input.workspace_id.trim();
    if workspace_id.is_empty() {
        return Err("工作区 ID 不能为空".to_string());
    }

    let mut conn = open_config_connection(app)?;
    ensure_workspace_exists(&conn, workspace_id)?;

    let skill_names = normalize_skill_names(input.enabled_skill_names);
    let now = now_millis()?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("无法开始保存工作区 Skills：{error}"))?;
    tx.execute(
        "DELETE FROM workspace_enabled_skills WHERE workspace_id = ?1",
        params![workspace_id],
    )
    .map_err(|error| format!("无法清空工作区 Skills：{error}"))?;

    for skill_name in skill_names {
        tx.execute(
            r#"
            INSERT INTO workspace_enabled_skills (workspace_id, skill_name, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            "#,
            params![workspace_id, skill_name, now, now],
        )
        .map_err(|error| format!("无法保存工作区 Skill：{error}"))?;
    }

    tx.commit()
        .map_err(|error| format!("无法提交工作区 Skills：{error}"))?;

    workspace_skill_settings(app, workspace_id)
}

fn load_workspace_skill_names(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT skill_name
            FROM workspace_enabled_skills
            WHERE workspace_id = ?1
            ORDER BY created_at ASC, skill_name ASC
            "#,
        )
        .map_err(|error| format!("无法读取工作区 Skills：{error}"))?;

    let skill_names = statement
        .query_map(params![workspace_id], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取工作区 Skills：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析工作区 Skills：{error}"))?;

    Ok(skill_names)
}

fn normalize_skill_names(skill_names: Vec<String>) -> Vec<String> {
    skill_names
        .into_iter()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
