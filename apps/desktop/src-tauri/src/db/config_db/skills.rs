use rusqlite::{params, Connection, Transaction};
use std::collections::BTreeSet;
use tauri::AppHandle;

use super::{
    common::{normalize_optional_text, normalize_record_id, now_millis},
    connection::open_config_connection,
    inputs::{SaveSkillGroupInput, SaveWorkspaceSkillsInput},
    models::{SkillGroup, WorkspaceSkillSettings},
    workspace::ensure_workspace_exists,
};

struct NormalizedSkillGroup {
    id: String,
    name: String,
    description: Option<String>,
    skill_names: Vec<String>,
}

pub fn workspace_skill_settings(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<WorkspaceSkillSettings, String> {
    let conn = open_config_connection(app)?;
    ensure_workspace_exists(&conn, workspace_id)?;

    Ok(WorkspaceSkillSettings {
        enabled_skill_names: load_workspace_skill_names(&conn, workspace_id)?,
        skill_groups: load_skill_groups(&conn)?,
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
    let skill_groups = input
        .skill_groups
        .map(normalize_skill_groups)
        .transpose()?;
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

    if let Some(skill_groups) = skill_groups {
        save_skill_groups(&tx, skill_groups, now)?;
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

fn load_skill_groups(conn: &Connection) -> Result<Vec<SkillGroup>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, name, description, "order", created_at, updated_at
            FROM skill_groups
            ORDER BY "order" ASC, created_at ASC, name ASC
            "#,
        )
        .map_err(|error| format!("无法读取 Skill 分组：{error}"))?;

    let group_rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|error| format!("无法读取 Skill 分组：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 Skill 分组：{error}"))?;

    group_rows
        .into_iter()
        .map(|(id, name, description, order, created_at, updated_at)| {
            Ok(SkillGroup {
                skill_names: load_skill_group_names(conn, &id)?,
                id,
                name,
                description,
                order,
                created_at,
                updated_at,
            })
        })
        .collect()
}

fn load_skill_group_names(conn: &Connection, group_id: &str) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT skill_name
            FROM skill_group_skills
            WHERE group_id = ?1
            ORDER BY created_at ASC, skill_name ASC
            "#,
        )
        .map_err(|error| format!("无法读取 Skill 分组成员：{error}"))?;

    let skill_names = statement
        .query_map(params![group_id], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取 Skill 分组成员：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 Skill 分组成员：{error}"))?;

    Ok(skill_names)
}

fn save_skill_groups(
    tx: &Transaction<'_>,
    skill_groups: Vec<NormalizedSkillGroup>,
    now: i64,
) -> Result<(), String> {
    tx.execute("DELETE FROM skill_groups", [])
        .map_err(|error| format!("无法清空 Skill 分组：{error}"))?;

    for (index, group) in skill_groups.into_iter().enumerate() {
        tx.execute(
            r#"
            INSERT INTO skill_groups (id, name, description, "order", created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                &group.id,
                &group.name,
                &group.description,
                index as i64,
                now,
                now
            ],
        )
        .map_err(|error| format!("无法保存 Skill 分组：{error}"))?;

        for skill_name in group.skill_names {
            tx.execute(
                r#"
                INSERT INTO skill_group_skills (group_id, skill_name, created_at)
                VALUES (?1, ?2, ?3)
                "#,
                params![group.id, skill_name, now],
            )
            .map_err(|error| format!("无法保存 Skill 分组成员：{error}"))?;
        }
    }

    Ok(())
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

fn normalize_skill_groups(
    skill_groups: Vec<SaveSkillGroupInput>,
) -> Result<Vec<NormalizedSkillGroup>, String> {
    let mut names = BTreeSet::new();
    let mut normalized = Vec::new();

    for group in skill_groups {
        let name = group.name.trim().to_string();
        if name.is_empty() {
            return Err("Skill 分组名称不能为空".to_string());
        }
        if !names.insert(name.clone()) {
            return Err(format!("Skill 分组名称重复：{name}"));
        }

        let skill_names = normalize_skill_names(group.skill_names);
        if skill_names.is_empty() {
            return Err(format!("Skill 分组「{name}」至少需要包含一个技能"));
        }

        normalized.push(NormalizedSkillGroup {
            id: normalize_record_id(group.id.as_deref()),
            name,
            description: normalize_optional_text(group.description.as_deref()),
            skill_names,
        });
    }

    Ok(normalized)
}
