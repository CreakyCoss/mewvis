use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Seek, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use zip::ZipArchive;

use super::{
    ensure_app_skills_path,
    parser::parse_skill_frontmatter,
    skill_key, write_skill_source_marker, SkillDefinition, SkillSource,
};

const USER_AGENT: &str = "Novel-Claw Skills Importer";
const MAX_SKILL_FILES: usize = 500;
const MAX_SKILL_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallSkillRequest {
    pub source: String,
    pub skill_name: Option<String>,
    pub source_kind: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstalledSkill {
    pub name: String,
    pub description: String,
    pub path: String,
    pub source_url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarketplaceSkill {
    pub name: String,
    pub description: String,
    pub author: String,
    pub github_url: String,
    pub skill_url: String,
    pub stars: i64,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarketplacePagination {
    pub page: u32,
    pub limit: u32,
    pub total: u32,
    pub total_pages: u32,
    pub has_next: bool,
    pub has_prev: bool,
    pub total_is_exact: Option<bool>,
}

#[derive(Debug, Clone)]
pub(crate) struct SearchSkillMarketplaceOptions {
    pub query: String,
    pub sort_by: Option<String>,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillMarketplaceSearch {
    pub skills: Vec<MarketplaceSkill>,
    pub pagination: Option<MarketplacePagination>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsMpSearchResponse {
    success: bool,
    data: Option<SkillsMpSearchData>,
    error: Option<SkillsMpError>,
}

#[derive(Debug, Deserialize)]
struct SkillsMpSearchData {
    skills: Vec<MarketplaceSkill>,
    pagination: Option<MarketplacePagination>,
}

#[derive(Debug, Deserialize)]
struct SkillsMpError {
    message: String,
}

#[derive(Debug, Clone)]
struct InstallSpec {
    owner: String,
    repo: String,
    ref_name: Option<String>,
    path: Option<String>,
    skill_name: Option<String>,
    source_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRepo {
    default_branch: String,
}

#[derive(Debug, Deserialize)]
struct GitTreeResponse {
    tree: Vec<GitTreeEntry>,
    truncated: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct GitTreeEntry {
    path: String,
    mode: String,
    #[serde(rename = "type")]
    entry_type: String,
    size: Option<u64>,
}

pub(crate) fn search_skill_marketplace(
    options: SearchSkillMarketplaceOptions,
) -> Result<SkillMarketplaceSearch, String> {
    let query = options.query.trim();
    if query.is_empty() {
        return Ok(SkillMarketplaceSearch {
            skills: Vec::new(),
            pagination: None,
        });
    }
    let sort_by = match options.sort_by.as_deref() {
        Some("updatedAt") => "updatedAt",
        _ => "stars",
    };
    let page = options.page.unwrap_or(1).max(1);
    let limit = options.limit.unwrap_or(12).clamp(1, 24);

    let client = http_client()?;
    let url = format!(
        "https://skillsmp.com/api/v1/skills/search?q={}&limit={}&page={}&sortBy={}",
        percent_encode(query),
        limit,
        page,
        sort_by,
    );
    let response: SkillsMpSearchResponse = get_json(&client, &url, "SkillsMP 搜索")?;
    if !response.success {
        return Err(response
            .error
            .map(|error| error.message)
            .unwrap_or_else(|| "SkillsMP 搜索失败".to_string()));
    }

    let Some(data) = response.data else {
        return Ok(SkillMarketplaceSearch {
            skills: Vec::new(),
            pagination: None,
        });
    };

    Ok(SkillMarketplaceSearch {
        skills: data.skills,
        pagination: data.pagination,
    })
}

pub(crate) fn install_skill_from_source(
    app: &AppHandle,
    request: InstallSkillRequest,
) -> Result<InstalledSkill, String> {
    let source = request.source.trim();
    if source.is_empty() {
        return Err("请输入 SkillsMP 链接、GitHub 链接或 skills add 安装命令".to_string());
    }

    if is_zip_install_request(source, request.source_kind.as_deref()) {
        return install_zip_skill(app, source);
    }

    let client = http_client()?;
    let spec = resolve_install_spec(&client, source, request.skill_name.as_deref())?;
    install_github_skill(app, &client, &spec)
}

fn resolve_install_spec(
    client: &Client,
    source: &str,
    explicit_skill_name: Option<&str>,
) -> Result<InstallSpec, String> {
    let decoded = decode_html_entities(source);

    let mut spec = if let Some(command_spec) = parse_skills_add_command(&decoded) {
        command_spec
    } else if is_skillsmp_url(&decoded) {
        resolve_skillsmp_install_spec(client, &decoded)?
    } else if let Some(github_url) = extract_github_url(&decoded) {
        parse_github_install_spec(&github_url, None)?
    } else {
        return Err("暂时只支持 SkillsMP 详情页、GitHub 链接或 skills add 安装命令".to_string());
    };

    if spec.skill_name.is_none() {
        spec.skill_name = explicit_skill_name
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(ToOwned::to_owned);
    }

    Ok(spec)
}

fn resolve_skillsmp_install_spec(client: &Client, url: &str) -> Result<InstallSpec, String> {
    if url.contains("/search") {
        return Err("搜索页包含多个技能，请先搜索并选择某个技能，或粘贴技能详情页链接".to_string());
    }

    let html = get_text(client, url, "SkillsMP 详情页")?;
    parse_skills_add_command(&html)
        .or_else(|| {
            let github_url = extract_github_url(&html)?;
            parse_github_install_spec(&github_url, extract_skill_name_from_title(&html).as_deref())
                .ok()
        })
        .ok_or_else(|| "无法从 SkillsMP 页面解析安装来源".to_string())
}

fn parse_skills_add_command(input: &str) -> Option<InstallSpec> {
    let decoded = decode_html_entities(input);
    let tokens = decoded
        .split_whitespace()
        .map(trim_command_token)
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>();

    let add_index = tokens
        .windows(2)
        .position(|pair| pair[0] == "skills" && pair[1] == "add")?;
    let repo_url = tokens.get(add_index + 2)?.to_string();
    let skill_name = tokens
        .windows(2)
        .find(|pair| pair[0] == "--skill")
        .map(|pair| pair[1].to_string());

    parse_github_install_spec(&repo_url, skill_name.as_deref()).ok()
}

fn parse_github_install_spec(
    url: &str,
    skill_name: Option<&str>,
) -> Result<InstallSpec, String> {
    let clean_url = decode_html_entities(url)
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim_end_matches(".git")
        .to_string();
    let marker = "github.com/";
    let Some(start) = clean_url.find(marker) else {
        return Err("安装来源不是 GitHub 链接".to_string());
    };

    let rest = clean_url[start + marker.len()..]
        .split(['?', '#'])
        .next()
        .unwrap_or("")
        .trim_matches('/');
    let parts = rest.split('/').collect::<Vec<_>>();
    if parts.len() < 2 {
        return Err("GitHub 链接缺少 owner/repo".to_string());
    }

    let owner = parts[0].to_string();
    let repo = parts[1].trim_end_matches(".git").to_string();
    if owner.is_empty() || repo.is_empty() {
        return Err("GitHub 链接缺少 owner/repo".to_string());
    }

    let (ref_name, path) = if parts.get(2) == Some(&"tree") && parts.len() >= 4 {
        (
            Some(parts[3].to_string()),
            parts
                .get(4..)
                .map(|segments| segments.join("/"))
                .filter(|path| !path.is_empty()),
        )
    } else {
        (None, None)
    };

    Ok(InstallSpec {
        owner,
        repo,
        ref_name,
        path,
        skill_name: skill_name
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(ToOwned::to_owned),
        source_url: clean_url,
    })
}

fn install_github_skill(
    app: &AppHandle,
    client: &Client,
    spec: &InstallSpec,
) -> Result<InstalledSkill, String> {
    let ref_name = match spec.ref_name.as_deref() {
        Some(value) if !value.trim().is_empty() => value.to_string(),
        _ => default_branch(client, spec)?,
    };
    let tree = github_tree(client, spec, &ref_name)?;
    if tree.truncated {
        return Err("GitHub 仓库文件列表被截断，无法可靠定位 Skill 目录".to_string());
    }

    let skill_dir = resolve_skill_dir(client, spec, &ref_name, &tree)?;
    let app_skills = ensure_app_skills_path(app)?;
    let temp_dir = app_skills.join(format!(
        ".install-{}-{}",
        safe_dir_name(
            spec.skill_name
                .as_deref()
                .or_else(|| skill_dir.rsplit('/').next())
                .unwrap_or("skill")
        ),
        now_millis()?
    ));
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|error| format!("无法清理临时目录：{error}"))?;
    }
    fs::create_dir_all(&temp_dir).map_err(|error| format!("无法创建临时目录：{error}"))?;

    let install_result = download_skill_dir(client, spec, &ref_name, &tree, &skill_dir, &temp_dir)
        .and_then(|_| {
            finalize_installed_skill(&app_skills, &temp_dir, &spec.source_url, SkillSource::App)
        });

    if install_result.is_err() {
        let _ = fs::remove_dir_all(&temp_dir);
    }

    install_result
}

fn install_zip_skill(app: &AppHandle, source: &str) -> Result<InstalledSkill, String> {
    let zip_path = PathBuf::from(source);
    if !zip_path.is_file() {
        return Err("请选择有效的 Skill zip 文件".to_string());
    }

    let app_skills = ensure_app_skills_path(app)?;
    let fallback_name = zip_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("skill");
    let temp_dir = app_skills.join(format!(
        ".upload-{}-{}",
        safe_dir_name(fallback_name),
        now_millis()?
    ));
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|error| format!("无法清理临时目录：{error}"))?;
    }
    fs::create_dir_all(&temp_dir).map_err(|error| format!("无法创建临时目录：{error}"))?;

    let install_result = extract_zip_skill(&zip_path, &temp_dir).and_then(|_| {
        finalize_installed_skill(
            &app_skills,
            &temp_dir,
            &zip_path.to_string_lossy(),
            SkillSource::Upload,
        )
    });

    if install_result.is_err() {
        let _ = fs::remove_dir_all(&temp_dir);
    }

    install_result
}

fn resolve_skill_dir(
    client: &Client,
    spec: &InstallSpec,
    ref_name: &str,
    tree: &GitTreeResponse,
) -> Result<String, String> {
    if let Some(path) = spec.path.as_deref().map(normalize_repo_path) {
        let dir = path.strip_suffix("/SKILL.md").unwrap_or(&path);
        if has_skill_file(tree, dir) {
            return Ok(dir.to_string());
        }

        if let Some(skill_name) = spec.skill_name.as_deref() {
            if let Some(found) = find_skill_dir_by_name(tree, Some(dir), skill_name) {
                return Ok(found);
            }
        }

        return Err(format!("GitHub 路径中没有找到 SKILL.md：{path}"));
    }

    if has_skill_file(tree, "") && spec.skill_name.is_none() {
        return Ok(String::new());
    }

    let Some(skill_name) = spec.skill_name.as_deref() else {
        return Err("GitHub 仓库中有多个目录时需要提供 --skill 名称".to_string());
    };

    if let Some(found) = find_skill_dir_by_name(tree, None, skill_name) {
        return Ok(found);
    }

    find_skill_dir_by_frontmatter(client, spec, ref_name, tree, skill_name)
        .ok_or_else(|| format!("没有在仓库中找到名为 {skill_name} 的 Skill"))
}

fn has_skill_file(tree: &GitTreeResponse, dir: &str) -> bool {
    let skill_file = if dir.is_empty() {
        "SKILL.md".to_string()
    } else {
        format!("{dir}/SKILL.md")
    };
    tree.tree
        .iter()
        .any(|entry| entry.entry_type == "blob" && entry.path == skill_file)
}

fn find_skill_dir_by_name(
    tree: &GitTreeResponse,
    base_dir: Option<&str>,
    skill_name: &str,
) -> Option<String> {
    let normalized_skill_name = skill_name.trim();
    tree.tree
        .iter()
        .filter(|entry| entry.entry_type == "blob" && entry.path.ends_with("/SKILL.md"))
        .filter_map(|entry| entry.path.strip_suffix("/SKILL.md").map(ToOwned::to_owned))
        .filter(|dir| {
            base_dir
                .map(|base| dir == base || dir.starts_with(&format!("{base}/")))
                .unwrap_or(true)
        })
        .find(|dir| {
            dir.rsplit('/')
                .next()
                .is_some_and(|name| name == normalized_skill_name)
        })
}

fn find_skill_dir_by_frontmatter(
    client: &Client,
    spec: &InstallSpec,
    ref_name: &str,
    tree: &GitTreeResponse,
    skill_name: &str,
) -> Option<String> {
    let candidates = tree
        .tree
        .iter()
        .filter(|entry| {
            entry.entry_type == "blob"
                && (entry.path == "SKILL.md" || entry.path.ends_with("/SKILL.md"))
        })
        .map(|entry| {
            entry
                .path
                .strip_suffix("/SKILL.md")
                .unwrap_or("")
                .to_string()
        })
        .collect::<Vec<String>>();

    if candidates.len() > 100 {
        return None;
    }

    candidates.into_iter().find(|dir| {
        let skill_path = if dir.is_empty() {
            "SKILL.md".to_string()
        } else {
            format!("{dir}/SKILL.md")
        };
        let Ok(content) = github_raw_text(client, spec, ref_name, &skill_path) else {
            return false;
        };
        let (name, _) = parse_skill_frontmatter(&content);
        name.as_deref() == Some(skill_name)
    })
}

fn download_skill_dir(
    client: &Client,
    spec: &InstallSpec,
    ref_name: &str,
    tree: &GitTreeResponse,
    skill_dir: &str,
    temp_dir: &Path,
) -> Result<(), String> {
    let prefix = if skill_dir.is_empty() {
        String::new()
    } else {
        format!("{skill_dir}/")
    };
    let files = tree
        .tree
        .iter()
        .filter(|entry| {
            entry.entry_type == "blob"
                && (skill_dir.is_empty() || entry.path.starts_with(&prefix))
        })
        .cloned()
        .collect::<Vec<_>>();

    if files.is_empty() {
        return Err("Skill 目录为空".to_string());
    }
    if files.len() > MAX_SKILL_FILES {
        return Err(format!("Skill 文件过多（{} 个），已停止导入", files.len()));
    }

    let total_bytes = files
        .iter()
        .map(|entry| entry.size.unwrap_or(0))
        .sum::<u64>();
    if total_bytes > MAX_SKILL_BYTES {
        return Err(format!(
            "Skill 目录超过 {} MB，已停止导入",
            MAX_SKILL_BYTES / 1024 / 1024
        ));
    }

    for entry in files {
        let relative = if skill_dir.is_empty() {
            entry.path.as_str()
        } else {
            entry
                .path
                .strip_prefix(&prefix)
                .ok_or_else(|| format!("无法解析 Skill 文件路径：{}", entry.path))?
        };
        let relative_path = safe_relative_path(relative)?;
        let target = temp_dir.join(relative_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建目录：{error}"))?;
        }

        let bytes = github_raw_bytes(client, spec, ref_name, &entry.path)?;
        let mut file = fs::File::create(&target).map_err(|error| {
            format!("无法写入 Skill 文件 {}：{error}", target.to_string_lossy())
        })?;
        file.write_all(&bytes).map_err(|error| {
            format!("无法保存 Skill 文件 {}：{error}", target.to_string_lossy())
        })?;

        set_executable_if_needed(&target, &entry)?;
    }

    Ok(())
}

fn finalize_installed_skill(
    app_skills: &Path,
    temp_dir: &Path,
    source_url: &str,
    source: SkillSource,
) -> Result<InstalledSkill, String> {
    let skill_file = temp_dir.join("SKILL.md");
    if !skill_file.is_file() {
        return Err("下载目录中缺少 SKILL.md".to_string());
    }

    let content = fs::read_to_string(&skill_file)
        .map_err(|error| format!("无法读取已下载的 SKILL.md：{error}"))?;
    let (name, description) = parse_skill_frontmatter(&content);
    let fallback_name = temp_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("skill")
        .trim_start_matches(".install-")
        .to_string();
    let name = name.unwrap_or(fallback_name);
    let destination_dir_name = match source {
        SkillSource::Upload => safe_dir_name(&format!("uploaded-{name}")),
        _ => safe_dir_name(&name),
    };
    let destination = app_skills.join(destination_dir_name);

    if destination.exists() {
        if destination.is_dir() {
            fs::remove_dir_all(&destination).map_err(|error| {
                format!("无法替换已有 Skill {}：{error}", destination.to_string_lossy())
            })?;
        } else {
            fs::remove_file(&destination).map_err(|error| {
                format!("无法替换已有 Skill {}：{error}", destination.to_string_lossy())
            })?;
        }
    }

    fs::rename(temp_dir, &destination)
        .map_err(|error| format!("无法安装 Skill 到应用目录：{error}"))?;
    write_skill_source_marker(&destination, &source)?;

    let definition = SkillDefinition {
        key: skill_key(&source, &name),
        name: name.clone(),
        description: description.unwrap_or_default(),
        content,
        source,
        path: destination.to_string_lossy().to_string(),
    };

    Ok(InstalledSkill {
        name: definition.name,
        description: definition.description,
        path: definition.path,
        source_url: source_url.to_string(),
    })
}

fn extract_zip_skill(zip_path: &Path, temp_dir: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path)
        .map_err(|error| format!("无法打开 zip 文件 {}：{error}", zip_path.to_string_lossy()))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("无法读取 zip 文件：{error}"))?;
    let skill_dir = resolve_zip_skill_dir(&mut archive)?;
    let prefix = if skill_dir.is_empty() {
        String::new()
    } else {
        format!("{skill_dir}/")
    };
    let mut extracted_files = 0usize;
    let mut total_bytes = 0u64;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("无法读取 zip 条目：{error}"))?;
        if file.is_dir() {
            continue;
        }

        let Some(enclosed_name) = file.enclosed_name() else {
            return Err(format!("zip 中包含不安全路径：{}", file.name()));
        };
        let normalized_path = normalize_zip_path(&enclosed_name)?;
        let relative = if skill_dir.is_empty() {
            normalized_path.as_str()
        } else {
            let Some(relative) = normalized_path.strip_prefix(&prefix) else {
                continue;
            };
            relative
        };
        if relative.is_empty() {
            continue;
        }

        extracted_files += 1;
        if extracted_files > MAX_SKILL_FILES {
            return Err(format!("Skill 文件过多（{extracted_files} 个），已停止导入"));
        }
        total_bytes = total_bytes.saturating_add(file.size());
        if total_bytes > MAX_SKILL_BYTES {
            return Err(format!(
                "Skill 目录超过 {} MB，已停止导入",
                MAX_SKILL_BYTES / 1024 / 1024
            ));
        }

        let relative_path = safe_relative_path(relative)?;
        let target = temp_dir.join(relative_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建目录：{error}"))?;
        }
        let mut target_file = fs::File::create(&target).map_err(|error| {
            format!("无法写入 Skill 文件 {}：{error}", target.to_string_lossy())
        })?;
        std::io::copy(&mut file, &mut target_file).map_err(|error| {
            format!("无法保存 Skill 文件 {}：{error}", target.to_string_lossy())
        })?;
    }

    if extracted_files == 0 {
        return Err("zip 中没有找到可导入的 Skill 文件".to_string());
    }
    if !temp_dir.join("SKILL.md").is_file() {
        return Err("zip 中缺少 SKILL.md".to_string());
    }

    Ok(())
}

fn resolve_zip_skill_dir<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<String, String> {
    let mut candidates = Vec::new();

    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("无法读取 zip 条目：{error}"))?;
        if file.is_dir() {
            continue;
        }
        let Some(enclosed_name) = file.enclosed_name() else {
            return Err(format!("zip 中包含不安全路径：{}", file.name()));
        };
        let normalized_path = normalize_zip_path(&enclosed_name)?;
        if normalized_path == "SKILL.md" {
            candidates.push(String::new());
        } else if let Some(dir) = normalized_path.strip_suffix("/SKILL.md") {
            candidates.push(dir.to_string());
        }
    }

    candidates.sort_by(|left, right| {
        left.matches('/')
            .count()
            .cmp(&right.matches('/').count())
            .then_with(|| left.len().cmp(&right.len()))
            .then_with(|| left.cmp(right))
    });
    candidates
        .into_iter()
        .next()
        .ok_or_else(|| "zip 中没有找到 SKILL.md".to_string())
}

fn default_branch(client: &Client, spec: &InstallSpec) -> Result<String, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}",
        percent_encode(&spec.owner),
        percent_encode(&spec.repo)
    );
    let repo: GitHubRepo = get_json(client, &url, "GitHub 仓库信息")?;
    Ok(repo.default_branch)
}

fn github_tree(
    client: &Client,
    spec: &InstallSpec,
    ref_name: &str,
) -> Result<GitTreeResponse, String> {
    let url = format!(
        "https://api.github.com/repos/{}/{}/git/trees/{}?recursive=1",
        percent_encode(&spec.owner),
        percent_encode(&spec.repo),
        percent_encode(ref_name)
    );
    get_json(client, &url, "GitHub 文件列表")
}

fn github_raw_text(
    client: &Client,
    spec: &InstallSpec,
    ref_name: &str,
    path: &str,
) -> Result<String, String> {
    let bytes = github_raw_bytes(client, spec, ref_name, path)?;
    String::from_utf8(bytes).map_err(|error| format!("GitHub 文件不是 UTF-8 文本：{error}"))
}

fn github_raw_bytes(
    client: &Client,
    spec: &InstallSpec,
    ref_name: &str,
    path: &str,
) -> Result<Vec<u8>, String> {
    let url = format!(
        "https://raw.githubusercontent.com/{}/{}/{}/{}",
        percent_encode(&spec.owner),
        percent_encode(&spec.repo),
        percent_encode(ref_name),
        encode_repo_path(path)
    );
    get_bytes(client, &url, "GitHub 文件")
}

fn get_json<T>(client: &Client, url: &str, label: &str) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let response = client
        .get(url)
        .header("User-Agent", USER_AGENT)
        .send()
        .map_err(|error| format!("{label}请求失败：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!("{label}请求失败（{status}）：{}", truncate(&body, 240)));
    }
    response
        .json::<T>()
        .map_err(|error| format!("{label}响应解析失败：{error}"))
}

fn get_text(client: &Client, url: &str, label: &str) -> Result<String, String> {
    let response = client
        .get(url)
        .header("User-Agent", USER_AGENT)
        .send()
        .map_err(|error| format!("{label}请求失败：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!("{label}请求失败（{status}）：{}", truncate(&body, 240)));
    }
    response
        .text()
        .map_err(|error| format!("{label}响应读取失败：{error}"))
}

fn get_bytes(client: &Client, url: &str, label: &str) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
        .header("User-Agent", USER_AGENT)
        .send()
        .map_err(|error| format!("{label}请求失败：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!("{label}请求失败（{status}）：{}", truncate(&body, 240)));
    }
    response
        .bytes()
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("{label}响应读取失败：{error}"))
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|error| format!("无法创建网络客户端：{error}"))
}

fn is_skillsmp_url(value: &str) -> bool {
    value.contains("skillsmp.com/")
}

fn is_zip_install_request(source: &str, source_kind: Option<&str>) -> bool {
    source_kind == Some("zip") || source.to_lowercase().ends_with(".zip")
}

fn extract_github_url(value: &str) -> Option<String> {
    let decoded = decode_html_entities(value);
    let marker = "https://github.com/";
    let start = decoded.find(marker)?;
    let tail = &decoded[start..];
    let end = tail
        .find(|character: char| {
            character.is_whitespace()
                || matches!(
                    character,
                    '"' | '\'' | '<' | '>' | '`' | ')' | ']' | '}'
                )
        })
        .unwrap_or(tail.len());

    Some(
        tail[..end]
            .trim_end_matches([',', '.', ';'])
            .to_string(),
    )
}

fn extract_skill_name_from_title(html: &str) -> Option<String> {
    let title_marker = "<title>";
    let start = html.find(title_marker)? + title_marker.len();
    let end = html[start..].find(" - ")? + start;
    Some(decode_html_entities(&html[start..end]).trim().to_string())
        .filter(|value| !value.is_empty())
}

fn trim_command_token(value: &str) -> String {
    value
        .trim()
        .trim_matches('`')
        .trim_matches('"')
        .trim_matches('\'')
        .trim_end_matches(',')
        .to_string()
}

fn normalize_repo_path(value: &str) -> String {
    value
        .trim()
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect::<Vec<_>>()
        .join("/")
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let mut path = PathBuf::new();
    for segment in value.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(format!("Skill 文件路径不安全：{value}"));
        }
        path.push(segment);
    }
    Ok(path)
}

fn normalize_zip_path(path: &Path) -> Result<String, String> {
    let mut segments = Vec::new();
    for component in path.components() {
        let std::path::Component::Normal(segment) = component else {
            return Err(format!("zip 中包含不安全路径：{}", path.to_string_lossy()));
        };
        let Some(segment) = segment.to_str() else {
            return Err(format!("zip 路径不是有效文本：{}", path.to_string_lossy()));
        };
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(format!("zip 中包含不安全路径：{}", path.to_string_lossy()));
        }
        segments.push(segment.to_string());
    }

    if segments.is_empty() {
        return Err("zip 中包含空路径".to_string());
    }

    Ok(segments.join("/"))
}

fn safe_dir_name(value: &str) -> String {
    let name = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches(['.', '-'])
        .chars()
        .take(80)
        .collect::<String>();

    if name.is_empty() || name.starts_with('.') {
        "skill".to_string()
    } else {
        name
    }
}

fn percent_encode(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (*byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn encode_repo_path(value: &str) -> String {
    value
        .split('/')
        .map(percent_encode)
        .collect::<Vec<_>>()
        .join("/")
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn truncate(value: &str, max_chars: usize) -> String {
    let mut output = value.chars().take(max_chars).collect::<String>();
    if value.chars().count() > max_chars {
        output.push_str("...");
    }
    output
}

fn now_millis() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{error}"))?;
    Ok(duration.as_millis() as i64)
}

#[cfg(unix)]
fn set_executable_if_needed(path: &Path, entry: &GitTreeEntry) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    if entry.mode != "100755" {
        return Ok(());
    }

    let mut permissions = fs::metadata(path)
        .map_err(|error| format!("无法读取脚本权限：{error}"))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).map_err(|error| format!("无法设置脚本权限：{error}"))
}

#[cfg(not(unix))]
fn set_executable_if_needed(_path: &Path, _entry: &GitTreeEntry) -> Result<(), String> {
    Ok(())
}
