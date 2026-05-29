use std::{fs, path::PathBuf};
use tauri::AppHandle;

mod parser;
mod resource;

pub(crate) use resource::bundled_skills_path;

use parser::parse_skill_frontmatter;

#[derive(Debug)]
pub(crate) struct SkillDefinition {
    pub name: String,
    pub description: String,
    pub content: String,
}

pub(crate) fn load_bundled_skills(app: &AppHandle) -> Result<Vec<SkillDefinition>, String> {
    let Some(skills_path) = bundled_skills_path(app)? else {
        return Ok(Vec::new());
    };

    let mut skills = scan_skills(&skills_path)?;
    skills.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(skills)
}

fn scan_skills(root: &PathBuf) -> Result<Vec<SkillDefinition>, String> {
    let mut skills = Vec::new();
    scan_skills_dir(root, &mut skills)?;
    Ok(skills)
}

fn scan_skills_dir(dir: &PathBuf, skills: &mut Vec<SkillDefinition>) -> Result<(), String> {
    let skill_file = dir.join("SKILL.md");
    if skill_file.is_file() {
        skills.push(read_skill(&skill_file, dir)?);
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
            scan_skills_dir(&path, skills)?;
        }
    }

    Ok(())
}

fn read_skill(skill_file: &PathBuf, base_dir: &PathBuf) -> Result<SkillDefinition, String> {
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
    })
}
