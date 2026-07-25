use rusqlite::{params, Connection, OptionalExtension, Transaction};
use std::collections::BTreeSet;
use tauri::AppHandle;

use super::{
    common::{normalize_optional_text, normalize_record_id, now_millis},
    connection::open_config_connection,
    inputs::{SaveSkillGroupInput, SaveWorkspaceSkillsInput},
    models::{SkillGroup, SkillGroupSkill, WorkspaceSkillSettings},
    workspace::ensure_workspace_exists,
};

struct NormalizedSkillGroups {
    custom: Vec<NormalizedSkillGroup>,
}

struct NormalizedSkillGroup {
    id: String,
    name: String,
    description: Option<String>,
    skills: Vec<SkillGroupSkill>,
}

const DEFAULT_SKILL_GROUP_SETTING_KEY: &str = "default_group_id";

pub fn workspace_skill_settings(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<WorkspaceSkillSettings, String> {
    let conn = open_config_connection(app)?;
    ensure_workspace_exists(&conn, workspace_id)?;

    Ok(WorkspaceSkillSettings {
        default_group_id: load_default_skill_group_id(&conn)?,
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

    let skill_groups = input.skill_groups.map(normalize_skill_groups).transpose()?;
    let now = now_millis()?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("无法开始保存工作区 Skills：{error}"))?;

    if let Some(skill_groups) = skill_groups {
        save_skill_groups(&tx, skill_groups.custom, now)?;
    }
    if let Some(default_group_id) = input.default_group_id {
        save_default_skill_group_id(&tx, default_group_id, now)?;
    }

    tx.commit()
        .map_err(|error| format!("无法提交工作区 Skills：{error}"))?;

    workspace_skill_settings(app, workspace_id)
}

fn load_default_skill_group_id(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row(
        r#"
        SELECT value
        FROM skill_settings
        WHERE key = ?1
        "#,
        params![DEFAULT_SKILL_GROUP_SETTING_KEY],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|error| format!("无法读取默认 Skill 分组：{error}"))
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
                skills: load_skill_group_skills(conn, &id)?,
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

fn save_default_skill_group_id(
    tx: &Transaction<'_>,
    default_group_id: String,
    now: i64,
) -> Result<(), String> {
    let normalized = default_group_id.trim();
    if normalized.is_empty() {
        tx.execute(
            "DELETE FROM skill_settings WHERE key = ?1",
            params![DEFAULT_SKILL_GROUP_SETTING_KEY],
        )
        .map_err(|error| format!("无法清空默认 Skill 分组：{error}"))?;
        return Ok(());
    }

    tx.execute(
        r#"
        INSERT INTO skill_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        "#,
        params![DEFAULT_SKILL_GROUP_SETTING_KEY, normalized, now],
    )
    .map_err(|error| format!("无法保存默认 Skill 分组：{error}"))?;

    Ok(())
}

fn load_skill_group_skills(
    conn: &Connection,
    group_id: &str,
) -> Result<Vec<SkillGroupSkill>, String> {
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

    let skills = statement
        .query_map(params![group_id], |row| {
            Ok(SkillGroupSkill {
                key: row.get::<_, String>(0)?,
            })
        })
        .map_err(|error| format!("无法读取 Skill 分组成员：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 Skill 分组成员：{error}"))?;

    Ok(skills)
}

fn save_skill_groups(
    tx: &Transaction<'_>,
    skill_groups: Vec<NormalizedSkillGroup>,
    now: i64,
) -> Result<(), String> {
    tx.execute("DELETE FROM skill_group_skills", [])
        .map_err(|error| format!("无法清空 Skill 分组成员：{error}"))?;
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

        for skill in group.skills {
            tx.execute(
                r#"
                INSERT INTO skill_group_skills (group_id, skill_name, created_at)
                VALUES (?1, ?2, ?3)
                "#,
                params![&group.id, &skill.key, now],
            )
            .map_err(|error| format!("无法保存 Skill 分组成员：{error}"))?;
        }
    }

    Ok(())
}

fn normalize_skill_members(
    skills: Vec<super::inputs::SaveSkillGroupSkillInput>,
) -> Vec<SkillGroupSkill> {
    let mut normalized = BTreeSet::new();
    for skill in skills {
        let key = skill.key.trim().to_string();
        if key.is_empty() {
            continue;
        }
        normalized.insert(key);
    }

    normalized
        .into_iter()
        .map(|key| SkillGroupSkill { key })
        .collect()
}

fn normalize_skill_groups(
    skill_groups: Vec<SaveSkillGroupInput>,
) -> Result<NormalizedSkillGroups, String> {
    let mut names = BTreeSet::new();
    let mut custom = Vec::new();

    for group in skill_groups {
        let source = group.source.as_deref().map(str::trim).unwrap_or("");
        let is_readonly =
            group.readonly.unwrap_or(false) || (!source.is_empty() && source != "custom");
        let skills = normalize_skill_members(group.skills);

        if is_readonly {
            let id = group.id.as_deref().map(str::trim).unwrap_or("");
            if id.is_empty() {
                return Err("内置 Skill 分组 ID 不能为空".to_string());
            }
            continue;
        }

        let name = group.name.trim().to_string();
        if name.is_empty() {
            return Err("Skill 分组名称不能为空".to_string());
        }
        if !names.insert(name.clone()) {
            return Err(format!("Skill 分组名称重复：{name}"));
        }

        if skills.is_empty() {
            return Err(format!("Skill 分组「{name}」至少需要包含一个技能"));
        }

        custom.push(NormalizedSkillGroup {
            id: normalize_record_id(group.id.as_deref()),
            name,
            description: normalize_optional_text(group.description.as_deref()),
            skills,
        });
    }

    Ok(NormalizedSkillGroups { custom })
}
