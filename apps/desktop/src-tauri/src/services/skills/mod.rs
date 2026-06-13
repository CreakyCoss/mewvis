use serde::Serialize;
use std::{fs, path::PathBuf};
use tauri::AppHandle;

mod installer;
mod parser;
mod resource;

pub(crate) use installer::{
    install_skill_from_source, search_skill_marketplace, InstallSkillRequest, InstalledSkill,
    MarketplacePagination, MarketplaceSkill, SearchSkillMarketplaceOptions,
};
pub(crate) use resource::{app_skills_path, bundled_skills_path, ensure_app_skills_path};

use parser::parse_skill_frontmatter;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SkillSource {
    System,
    App,
    Upload,
}

impl SkillSource {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::System => "system",
            Self::App => "app",
            Self::Upload => "upload",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct SkillDefinition {
    pub key: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub source: SkillSource,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemovedSkill {
    pub key: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone)]
pub(crate) struct SkillDefaultGroup {
    pub id: &'static str,
    pub name: &'static str,
    pub order: i64,
}

pub(crate) fn load_bundled_skills(app: &AppHandle) -> Result<Vec<SkillDefinition>, String> {
    let Some(skills_path) = bundled_skills_path(app)? else {
        return Ok(Vec::new());
    };

    let mut skills = scan_skills(&skills_path, SkillSource::System)?;
    skills.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(skills)
}

pub(crate) fn load_app_skills(app: &AppHandle) -> Result<Vec<SkillDefinition>, String> {
    let skills_path = app_skills_path(app)?;
    if !skills_path.exists() {
        return Ok(Vec::new());
    }

    let mut skills = scan_skills(&skills_path, SkillSource::App)?;
    skills.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(skills)
}

pub(crate) fn remove_app_skill(
    app: &AppHandle,
    name: Option<&str>,
    key: Option<&str>,
    path: Option<&str>,
) -> Result<RemovedSkill, String> {
    let name = name.map(str::trim).unwrap_or("");
    let key = key.map(str::trim).unwrap_or("");
    let path = path.map(str::trim).unwrap_or("");
    let name = name.trim();
    if name.is_empty() && key.is_empty() && path.is_empty() {
        return Err("请选择要移除的 Skill".to_string());
    }

    let app_skills = app_skills_path(app)?;
    if !app_skills.exists() {
        return Err(format!("没有找到可移除的 Skill：{name}"));
    }

    let app_skills_root = app_skills
        .canonicalize()
        .map_err(|error| format!("无法定位应用 Skills 目录：{error}"))?;
    let skill = load_app_skills(app)?
        .into_iter()
        .find(|skill| {
            (!key.is_empty() && skill.key == key)
                || (!path.is_empty() && skill.path == path)
                || (!name.is_empty() && skill.name == name)
        })
        .ok_or_else(|| {
            if !name.is_empty() {
                format!("没有找到可移除的 Skill：{name}")
            } else {
                "没有找到可移除的 Skill".to_string()
            }
        })?;
    let target = PathBuf::from(&skill.path);
    let target_path = target
        .canonicalize()
        .map_err(|error| format!("无法定位 Skill 目录：{error}"))?;

    if target_path == app_skills_root || !target_path.starts_with(&app_skills_root) {
        return Err("只允许移除应用目录中的 Skill".to_string());
    }
    if !target_path.join("SKILL.md").is_file() {
        return Err("目标目录不是有效的 Skill".to_string());
    }

    fs::remove_dir_all(&target_path)
        .map_err(|error| format!("无法移除 Skill {}：{error}", target_path.to_string_lossy(),))?;

    Ok(RemovedSkill {
        key: skill.key,
        name: skill.name,
        path: target_path.to_string_lossy().to_string(),
    })
}

pub(crate) fn load_available_skills(app: &AppHandle) -> Result<Vec<SkillDefinition>, String> {
    let mut skills = load_bundled_skills(app)?;
    skills.extend(load_app_skills(app)?);
    skills.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.source.as_str().cmp(right.source.as_str()))
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(skills)
}

pub(crate) fn default_group_for_skill(skill: &SkillDefinition) -> SkillDefaultGroup {
    if skill.source == SkillSource::Upload {
        return SkillDefaultGroup {
            id: "app-uploaded",
            name: "本地上传",
            order: 910,
        };
    }

    match skill.name.as_str() {
        name if name.starts_with("story-long-") => SkillDefaultGroup {
            id: "system-story-creation",
            name: "小说创作",
            order: 10,
        },
        name if name.starts_with("story-short-") => SkillDefaultGroup {
            id: "system-story-creation",
            name: "小说创作",
            order: 10,
        },
        "story-cover" | "story-deslop" => SkillDefaultGroup {
            id: "system-story-creation",
            name: "小说创作",
            order: 10,
        },
        "bazi" | "chenggu-analysis" | "yuan" => SkillDefaultGroup {
            id: "system-metaphysics",
            name: "命理分析",
            order: 40,
        },
        "browser-cdp" => SkillDefaultGroup {
            id: "system-automation",
            name: "通用工具",
            order: 50,
        },
        _ => SkillDefaultGroup {
            id: "system-general",
            name: "系统技能",
            order: 100,
        },
    }
}

fn scan_skills(root: &PathBuf, source: SkillSource) -> Result<Vec<SkillDefinition>, String> {
    let mut skills = Vec::new();
    scan_skills_dir(root, &source, &mut skills)?;
    Ok(skills)
}

fn scan_skills_dir(
    dir: &PathBuf,
    source: &SkillSource,
    skills: &mut Vec<SkillDefinition>,
) -> Result<(), String> {
    let skill_file = dir.join("SKILL.md");
    if skill_file.is_file() {
        skills.push(read_skill(&skill_file, dir, source.clone())?);
        return Ok(());
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) => return Err(format!("无法读取 Skills 目录：{error}")),
    };

    for entry in entries {
        let entry = entry.map_err(|error| format!("无法读取 Skill 条目：{error}"))?;
        let path = entry.path();
        if path.is_dir() {
            scan_skills_dir(&path, source, skills)?;
        }
    }

    Ok(())
}

fn read_skill(
    skill_file: &PathBuf,
    base_dir: &PathBuf,
    source: SkillSource,
) -> Result<SkillDefinition, String> {
    let content = fs::read_to_string(skill_file).map_err(|error| {
        format!(
            "无法读取 Skill 文件 {}：{error}",
            skill_file.to_string_lossy()
        )
    })?;
    let (name, description) = parse_skill_frontmatter(&content);
    let fallback_name = base_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("skill")
        .to_string();
    let name = name.unwrap_or(fallback_name);
    let source = effective_skill_source(base_dir, source);
    let path = base_dir.to_string_lossy().to_string();

    Ok(SkillDefinition {
        key: skill_key(&source, &name),
        name,
        description: description.unwrap_or_default(),
        content,
        source,
        path,
    })
}

pub(crate) fn skill_key(source: &SkillSource, name: &str) -> String {
    format!("{}:{name}", source.as_str())
}

pub(crate) fn write_skill_source_marker(dir: &PathBuf, source: &SkillSource) -> Result<(), String> {
    fs::write(dir.join(".novel-claw-skill-source"), source.as_str())
        .map_err(|error| format!("无法写入 Skill 来源标记：{error}"))
}

fn effective_skill_source(base_dir: &PathBuf, fallback: SkillSource) -> SkillSource {
    if fallback != SkillSource::App {
        return fallback;
    }

    let marker = base_dir.join(".novel-claw-skill-source");
    let Ok(value) = fs::read_to_string(marker) else {
        return fallback;
    };

    match value.trim() {
        "upload" => SkillSource::Upload,
        _ => fallback,
    }
}
