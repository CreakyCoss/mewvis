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
}

impl SkillSource {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::System => "system",
            Self::App => "app",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct SkillDefinition {
    pub name: String,
    pub description: String,
    pub content: String,
    pub source: SkillSource,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemovedSkill {
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

pub(crate) fn remove_app_skill(app: &AppHandle, name: &str) -> Result<RemovedSkill, String> {
    let name = name.trim();
    if name.is_empty() {
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
        .find(|skill| skill.name == name)
        .ok_or_else(|| format!("没有找到可移除的 Skill：{name}"))?;
    let target = PathBuf::from(&skill.path);
    let target_path = target
        .canonicalize()
        .map_err(|error| format!("无法定位 Skill 目录：{error}"))?;

    if target_path == app_skills_root || !target_path.starts_with(&app_skills_root) {
        return Err("只允许移除应用目录中的个人 Skill".to_string());
    }
    if !target_path.join("SKILL.md").is_file() {
        return Err("目标目录不是有效的 Skill".to_string());
    }

    fs::remove_dir_all(&target_path).map_err(|error| {
        format!(
            "无法移除 Skill {}：{error}",
            target_path.to_string_lossy(),
        )
    })?;

    Ok(RemovedSkill {
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
    });
    skills.dedup_by(|left, right| left.name == right.name);
    Ok(skills)
}

pub(crate) fn default_group_for_skill(skill: &SkillDefinition) -> SkillDefaultGroup {
    if skill.source != SkillSource::System {
        return SkillDefaultGroup {
            id: "app-imported",
            name: "导入技能",
            order: 900,
        };
    }

    match skill.name.as_str() {
        name if name.starts_with("story-long-") => SkillDefaultGroup {
            id: "system-story-long",
            name: "长篇创作",
            order: 10,
        },
        name if name.starts_with("story-short-") => SkillDefaultGroup {
            id: "system-story-short",
            name: "短篇创作",
            order: 20,
        },
        "story-cover" | "story-deslop" => SkillDefaultGroup {
            id: "system-story-tools",
            name: "小说工具",
            order: 30,
        },
        "bazi" | "chenggu-analysis" | "yuan" => SkillDefaultGroup {
            id: "system-metaphysics",
            name: "命理分析",
            order: 40,
        },
        "browser-cdp" => SkillDefaultGroup {
            id: "system-automation",
            name: "浏览器自动化",
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

    Ok(SkillDefinition {
        name: name.unwrap_or(fallback_name),
        description: description.unwrap_or_default(),
        content,
        source,
        path: base_dir.to_string_lossy().to_string(),
    })
}
