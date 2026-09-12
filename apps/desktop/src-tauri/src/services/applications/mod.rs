pub(crate) mod data;
pub(crate) mod paths;
pub(crate) mod ui;
pub(crate) mod workspaces;

use serde::{Deserialize, Deserializer, Serialize};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};
use tauri::{path::BaseDirectory, AppHandle, Manager};
use uuid::Uuid;

use crate::commands::agent_runtime::AgentAccess;
use crate::product_config::{app_data_dir_name, product_env_var};

const REGISTRY_SCHEMA_VERSION: u32 = 1;
const MAX_APPLICATION_FILES: usize = 20_000;
const MAX_APPLICATION_BYTES: u64 = 256 * 1024 * 1024;
const MAX_INSTALL_FILES: usize = 100_000;
const MAX_INSTALL_BYTES: u64 = 768 * 1024 * 1024;
const MAX_MARKETPLACE_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;
const DSH_MARKETPLACE_API: &str = "https://dshmarketplace.dev/api/v1/plugins";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ApplicationRuntimeKind {
    Isle,
    Dsh,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApplicationCompatibility {
    pub adapter: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ApplicationPermission {
    Network,
    ApplicationData,
    ApplicationWorkspaces,
    WorkspaceFiles,
    OpenExternal,
    Process,
    Chat,
    ChatKnowledge,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ApplicationPermissionStatus {
    Declared,
    IsleUpgradeRequired,
    DshUnsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApplicationDescriptor {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub source: String,
    pub enabled: bool,
    pub default_enabled: bool,
    pub path: String,
    pub runtime_kind: ApplicationRuntimeKind,
    pub entry: String,
    #[serde(skip_serializing)]
    pub dsh_patch: Option<String>,
    pub compatibility: Vec<ApplicationCompatibility>,
    pub permissions: Vec<ApplicationPermission>,
    pub agent_access: Option<AgentAccess>,
    pub permission_status: ApplicationPermissionStatus,
    pub origin: Option<ApplicationOrigin>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApplicationOrigin {
    pub kind: String,
    pub marketplace: String,
    pub full_name: String,
    pub package: String,
    pub repo_url: String,
}

#[derive(Debug, Clone)]
pub(crate) struct RuntimeApplication {
    pub kind: ApplicationRuntimeKind,
    pub id: String,
    pub entry: String,
    pub package_root: String,
    pub patch_path: Option<String>,
    pub agent_access: Option<AgentAccess>,
    pub permissions: Vec<ApplicationPermission>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemovedApplication {
    pub id: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarketplaceApplication {
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub full_name: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub name: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub owner: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub summary: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub summary_zh: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub category: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub language: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub license: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub stars: u64,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub pushed_at: String,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub repo_url: String,
    pub npm_package: Option<String>,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub installable: bool,
    pub install_check: Option<String>,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub blocked_builds: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub risk_flags: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub in_registry: bool,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarketplaceSearchResult {
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub total: u64,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub count: u64,
    #[serde(default, deserialize_with = "deserialize_null_default")]
    pub results: Vec<MarketplaceApplication>,
}

fn deserialize_null_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallMarketplaceApplicationRequest {
    pub provider: String,
    pub full_name: String,
    pub npm_package: String,
    #[serde(default)]
    pub repo_url: String,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplicationRegistry {
    #[serde(default = "registry_schema_version")]
    schema_version: u32,
    #[serde(default)]
    enabled: BTreeMap<String, bool>,
}

#[derive(Debug, Deserialize)]
struct PackageManifest {
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    description: String,
    main: Option<String>,
    exports: Option<serde_json::Value>,
    dsh: Option<DshManifest>,
    isle: Option<IsleManifest>,
}

#[derive(Debug, Deserialize)]
struct DshManifest {
    bundle: Option<DshBundleManifest>,
}

#[derive(Debug, Deserialize)]
struct DshBundleManifest {
    patch: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IsleManifest {
    #[serde(default)]
    default_enabled: bool,
    display_name: Option<String>,
    app: Option<IsleApplicationManifest>,
    permissions: Option<Vec<ApplicationPermission>>,
    agent_access: Option<AgentAccess>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IsleApplicationManifest {
    version: u32,
    entry: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ApplicationSource {
    Bundled,
    Installed,
}

impl ApplicationSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Bundled => "bundled",
            Self::Installed => "installed",
        }
    }
}

fn registry_schema_version() -> u32 {
    REGISTRY_SCHEMA_VERSION
}

pub(crate) fn list_applications(app: &AppHandle) -> Result<Vec<ApplicationDescriptor>, String> {
    let bundled_root = bundled_applications_path(app)?;
    let app_root = app_applications_root(app)?;
    list_applications_at(bundled_root.as_deref(), &app_root)
}

pub(crate) fn settings_location(app: &AppHandle) -> Result<String, String> {
    Ok(app_applications_root(app)?.to_string_lossy().to_string())
}

/// Held for the app lifetime: a second process cannot migrate files while applications are using them.
struct ApplicationLayoutGuard { _file: fs::File }

pub(crate) fn initialize_application_layout(app: &AppHandle) -> Result<(), String> {
    let root = app_applications_root(app)?;
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let path = root.join(".layout.lock");
    if fs::symlink_metadata(&path).is_ok_and(|info| info.file_type().is_symlink()) {
        return Err("应用目录锁不能是符号链接".into());
    }
    let file = fs::OpenOptions::new().read(true).write(true).create(true).truncate(false)
        .open(path).map_err(|error| error.to_string())?;
    file.try_lock().map_err(|error| format!("应用数据正在被其他 Isle 实例使用：{error}"))?;
    let ids = list_applications(app)?.into_iter().map(|application| application.id).collect::<Vec<_>>();
    let migration = self::ui::resolve_service_path(app)?.with_file_name("migrate-layout.mjs");
    let output = Command::new(resolve_node_binary(app)?)
        .arg(migration).arg(&root).args(ids).stdin(Stdio::null()).output()
        .map_err(|error| format!("无法启动应用目录迁移：{error}"))?;
    if !output.status.success() {
        return Err(format!("应用目录迁移失败，旧数据已保留：{}", String::from_utf8_lossy(&output.stderr)));
    }
    app.manage(ApplicationLayoutGuard { _file: file });
    Ok(())
}

pub(crate) fn enabled_runtime_applications(app: &AppHandle) -> Result<Vec<RuntimeApplication>, String> {
    Ok(list_applications(app)?
        .into_iter()
        .filter(|application| application.enabled)
        .map(|application| RuntimeApplication {
            kind: application.runtime_kind,
            id: application.id.clone(),
            entry: application.entry,
            package_root: application.path,
            patch_path: application.dsh_patch,
            agent_access: application.agent_access,
            permissions: application.permissions,
        })
        .collect())
}

pub(crate) fn install_local_application(
    app: &AppHandle,
    source_path: &str,
    enable: Option<bool>,
) -> Result<ApplicationDescriptor, String> {
    let source_path = source_path.trim();
    if source_path.is_empty() {
        return Err("应用源目录不能为空".to_string());
    }

    let source_root = PathBuf::from(source_path)
        .canonicalize()
        .map_err(|error| format!("无法定位应用源目录：{error}"))?;
    if !source_root.is_dir() {
        return Err("应用源必须是目录".to_string());
    }
    let package = read_package(&source_root, ApplicationSource::Installed)?;
    require_installable_permissions(&package)?;
    let app_root = app_applications_root(app)?;
    let packages_root = self::paths::application_directory(&app_root, &package.id);
    if packages_root.starts_with(&source_root) {
        return Err("应用源目录不能包含应用应用安装目录".to_string());
    }
    create_install_directory(&app_root, &packages_root)?;

    let destination = packages_root.join("package");
    if destination.exists() {
        return Err(format!("应用已经安装：{}", package.id));
    }

    let staging = packages_root.join(format!(
        ".install-{}",
        Uuid::now_v7().simple()
    ));
    fs::create_dir(&staging).map_err(|error| format!("无法创建应用暂存目录：{error}"))?;
    if let Err(error) = copy_application_tree(&source_root, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    if let Err(error) = read_package(&staging, ApplicationSource::Installed)
        .and_then(|application| require_installable_permissions(&application))
    {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    if let Err(error) = fs::rename(&staging, &destination) {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("无法完成应用安装：{error}"));
    }

    let mut registry = read_registry(&app_root)?;
    registry.enabled.insert(
        package.id.clone(),
        initial_install_enabled(&package, enable),
    );
    if let Err(error) = write_registry(&app_root, &registry) {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }

    list_applications(app)?
        .into_iter()
        .find(|application| application.id == package.id)
        .ok_or_else(|| "应用已安装，但注册表未能重新发现它".to_string())
}

pub(crate) fn inspect_local_application(source_path: &str) -> Result<ApplicationDescriptor, String> {
    let source_path = source_path.trim();
    if source_path.is_empty() {
        return Err("应用源目录不能为空".to_string());
    }
    let source_root = PathBuf::from(source_path)
        .canonicalize()
        .map_err(|error| format!("无法定位应用源目录：{error}"))?;
    if !source_root.is_dir() {
        return Err("应用源必须是目录".to_string());
    }
    let application = read_package(&source_root, ApplicationSource::Installed)?;
    require_installable_permissions(&application)?;
    Ok(application)
}

pub(crate) fn search_marketplace(
    provider: &str,
    query: &str,
    page: Option<u32>,
    limit: Option<u32>,
) -> Result<MarketplaceSearchResult, String> {
    if provider != "dsh-community" {
        return Err(format!("不支持的应用市场来源：{provider}"));
    }
    let endpoint = std::env::var(product_env_var("DSH_MARKETPLACE_URL"))
        .unwrap_or_else(|_| DSH_MARKETPLACE_API.to_string());
    search_dsh_marketplace_at(&endpoint, query, page, limit)
}

fn search_dsh_marketplace_at(
    endpoint: &str,
    query: &str,
    page: Option<u32>,
    limit: Option<u32>,
) -> Result<MarketplaceSearchResult, String> {
    let mut url =
        reqwest::Url::parse(endpoint).map_err(|error| format!("DSH 市场地址无效：{error}"))?;
    if url.scheme() != "https" && !cfg!(debug_assertions) {
        return Err("DSH 市场地址必须使用 HTTPS".to_string());
    }
    url.query_pairs_mut()
        .append_pair("q", query.trim())
        .append_pair("page", &page.unwrap_or(1).max(1).to_string())
        .append_pair("limit", &limit.unwrap_or(20).clamp(1, 30).to_string());

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("Mewvis DSH Marketplace Client/0.1")
        .build()
        .map_err(|error| format!("无法初始化 DSH 市场客户端：{error}"))?;
    let response = client
        .get(url)
        .send()
        .map_err(|error| format!("无法连接 DSH 社区市场：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("DSH 社区市场返回错误：HTTP {status}"));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("未知")
        .to_string();
    let mut body = Vec::new();
    response
        .take(MAX_MARKETPLACE_RESPONSE_BYTES + 1)
        .read_to_end(&mut body)
        .map_err(|error| format!("无法读取 DSH 社区市场响应：{error}"))?;
    if body.len() as u64 > MAX_MARKETPLACE_RESPONSE_BYTES {
        return Err(format!(
            "DSH 社区市场响应超过 {} MiB 上限",
            MAX_MARKETPLACE_RESPONSE_BYTES / 1024 / 1024
        ));
    }
    serde_json::from_slice::<MarketplaceSearchResult>(&body).map_err(|error| {
        let preview = String::from_utf8_lossy(&body[..body.len().min(240)])
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        format!(
            "DSH 社区市场响应格式无效（Content-Type: {content_type}，响应预览：{preview}）：{error}"
        )
    })
}

pub(crate) fn install_marketplace_application(
    app: &AppHandle,
    request: InstallMarketplaceApplicationRequest,
) -> Result<ApplicationDescriptor, String> {
    if request.provider != "dsh-community" {
        return Err(format!("不支持的应用市场来源：{}", request.provider));
    }
    let full_name = validate_marketplace_full_name(&request.full_name)?;
    let npm_package = validate_npm_package_name(&request.npm_package)?;
    let app_root = app_applications_root(app)?;

    if list_applications(app)?
        .iter()
        .any(|application| application.id == npm_package)
    {
        return Err(format!("应用已经安装或已由应用内置：{npm_package}"));
    }

    let work = app_root.join(format!(".market-install-{}", Uuid::now_v7().simple()));
    fs::create_dir_all(&work).map_err(|error| format!("无法创建市场安装暂存目录：{error}"))?;
    let result = install_dsh_marketplace_application_in(
        app,
        &app_root,
        &work,
        &full_name,
        &npm_package,
        &request.repo_url,
    );
    let _ = fs::remove_dir_all(&work);
    result
}

fn install_dsh_marketplace_application_in(
    app: &AppHandle,
    app_root: &Path,
    work: &Path,
    full_name: &str,
    npm_package: &str,
    repo_url: &str,
) -> Result<ApplicationDescriptor, String> {
    fs::write(
        work.join("package.json"),
        "{\n  \"name\": \"isle-app-install\",\n  \"private\": true,\n  \"type\": \"module\"\n}\n",
    )
    .map_err(|error| format!("无法准备市场应用安装：{error}"))?;
    let npmrc = work.join(".npmrc");
    fs::write(
        &npmrc,
        "registry=https://registry.npmjs.org/\nignore-scripts=true\nnode-linker=hoisted\npackage-import-method=copy\n",
    )
    .map_err(|error| format!("无法准备市场应用安装配置：{error}"))?;

    let node = resolve_node_binary(app)?;
    let pnpm = resolve_pnpm_cli(app)?;
    let mut command = Command::new(&node);
    command
        .arg(&pnpm)
        .arg("add")
        .arg(npm_package)
        .arg("--save-exact")
        .arg("--ignore-scripts")
        .arg("--registry=https://registry.npmjs.org/")
        .arg("--config.node-linker=hoisted")
        .arg("--config.package-import-method=copy")
        .arg("--reporter=append-only")
        .arg("--store-dir")
        .arg(app_root.join("pnpm-store"))
        .current_dir(work)
        .env("NPM_CONFIG_USERCONFIG", &npmrc)
        .env("NO_COLOR", "1")
        .env("FORCE_COLOR", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_subprocess_window(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("无法启动安全应用安装器：{error}"))?;
    if !output.status.success() {
        let detail = application_installer_output(&output.stdout, &output.stderr);
        return Err(format!(
            "应用 {npm_package} 依赖下载失败（未执行安装脚本）：{}{}",
            output.status,
            if detail.is_empty() {
                String::new()
            } else {
                format!("\n{detail}")
            }
        ));
    }

    enforce_install_limits(&work.join("node_modules"))?;
    let installed_package = npm_package_path(&work.join("node_modules"), npm_package)?;
    let package = read_package(&installed_package, ApplicationSource::Installed)?;
    require_installable_permissions(&package)?;
    if list_applications(app)?
        .iter()
        .any(|application| application.id == package.id)
    {
        return Err(format!("应用已经安装或已由应用内置：{}", package.id));
    }

    let packages_root = self::paths::application_directory(app_root, &package.id);
    create_install_directory(app_root, &packages_root)?;
    let destination = packages_root.join("package");
    if destination.exists() {
        return Err(format!("应用安装目录已经存在：{}", package.id));
    }
    let staging = packages_root.join(format!(
        ".install-{}",
        Uuid::now_v7().simple()
    ));
    fs::create_dir(&staging).map_err(|error| format!("无法创建应用暂存目录：{error}"))?;

    let stage_result = (|| {
        copy_application_tree(&installed_package, &staging)?;
        fs::rename(work.join("node_modules"), staging.join("node_modules"))
            .map_err(|error| format!("无法保存应用依赖：{error}"))?;
        if work.join("pnpm-lock.yaml").is_file() {
            fs::copy(work.join("pnpm-lock.yaml"), staging.join("pnpm-lock.yaml"))
                .map_err(|error| format!("无法保存应用依赖锁文件：{error}"))?;
        }
        let origin = ApplicationOrigin {
            kind: "marketplace".to_string(),
            marketplace: "dshmarketplace.dev".to_string(),
            full_name: full_name.to_string(),
            package: npm_package.to_string(),
            repo_url: repo_url.trim().to_string(),
        };
        let origin_json = serde_json::to_string_pretty(&origin)
            .map_err(|error| format!("无法记录应用来源：{error}"))?;
        fs::write(
            staging.join(".isle-origin.json"),
            format!("{origin_json}\n"),
        )
        .map_err(|error| format!("无法记录应用来源：{error}"))?;
        let staged = read_package(&staging, ApplicationSource::Installed)?;
        require_installable_permissions(&staged)?;
        fs::rename(&staging, &destination).map_err(|error| format!("无法完成应用安装：{error}"))?;
        Ok::<(), String>(())
    })();
    if let Err(error) = stage_result {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }

    let mut registry = read_registry(app_root)?;
    registry.enabled.insert(package.id.clone(), false);
    if let Err(error) = write_registry(app_root, &registry) {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }

    list_applications(app)?
        .into_iter()
        .find(|application| application.id == package.id)
        .ok_or_else(|| "应用已安装，但注册表未能重新发现它".to_string())
}

fn application_installer_output(stdout: &[u8], stderr: &[u8]) -> String {
    let tail = |label: &str, bytes: &[u8]| {
        let value = String::from_utf8_lossy(bytes).replace('\r', "\n");
        let lines = value
            .lines()
            .map(str::trim_end)
            .filter(|line| !line.trim().is_empty())
            .rev()
            .take(12)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>();
        (!lines.is_empty()).then(|| format!("{label}：\n{}", lines.join("\n")))
    };
    [tail("pnpm 输出", stdout), tail("pnpm 错误", stderr)]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(4_000)
        .collect()
}

pub(crate) fn set_application_enabled(
    app: &AppHandle,
    id: &str,
    enabled: bool,
) -> Result<ApplicationDescriptor, String> {
    let id = id.trim();
    if id.is_empty() {
        return Err("应用 ID 不能为空".to_string());
    }
    let application = list_applications(app)?
        .into_iter()
        .find(|application| application.id == id)
        .ok_or_else(|| format!("没有找到应用：{id}"))?;
    if enabled && application.permission_status == ApplicationPermissionStatus::IsleUpgradeRequired {
        return Err(isle_permissions_upgrade_error(&application.id));
    }

    let app_root = app_applications_root(app)?;
    let mut registry = read_registry(&app_root)?;
    registry.enabled.insert(id.to_string(), enabled);
    write_registry(&app_root, &registry)?;

    list_applications(app)?
        .into_iter()
        .find(|application| application.id == id)
        .ok_or_else(|| format!("没有找到应用：{id}"))
}

pub(crate) fn remove_installed_application(app: &AppHandle, id: &str) -> Result<RemovedApplication, String> {
    let id = id.trim();
    let app_root = app_applications_root(app)?;
    let packages_root = self::paths::application_directory(&app_root, id);
    let installed = scan_installed_applications(&app_root)?;
    let application = installed
        .into_iter()
        .find(|application| application.id == id)
        .ok_or_else(|| format!("没有找到已安装应用：{id}"))?;

    let canonical_root = packages_root
        .canonicalize()
        .map_err(|error| format!("无法定位应用安装目录：{error}"))?;
    let target = PathBuf::from(&application.path)
        .canonicalize()
        .map_err(|error| format!("无法定位应用目录：{error}"))?;
    if target == canonical_root
        || !target.starts_with(&canonical_root)
        || target.parent() != Some(canonical_root.as_path())
        || target.file_name().and_then(|name| name.to_str()) != Some("package")
        || !target.join("package.json").is_file()
    {
        return Err("只允许移除应用应用目录中的完整应用包".to_string());
    }

    fs::remove_dir_all(&target).map_err(|error| format!("无法移除应用：{error}"))?;
    let mut registry = read_registry(&app_root)?;
    registry.enabled.remove(id);
    write_registry(&app_root, &registry)?;

    Ok(RemovedApplication {
        id: id.to_string(),
        path: target.to_string_lossy().to_string(),
    })
}

fn bundled_applications_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    if cfg!(debug_assertions) {
        let dev_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../agent-runtime/dist/apps");
        if dev_path.exists() {
            return Ok(Some(dev_path));
        }
    }

    for candidate in [
        "_up_/agent-runtime/dist/apps",
        "agent-runtime/dist/apps",
        "dist/apps",
        "applications",
    ] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位内置应用资源失败：{error}"))?;
        if path.exists() {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn app_applications_root(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("无法获取用户主目录：{error}"))?;
    Ok(home.join(app_data_dir_name()).join("apps"))
}

pub(crate) fn resolve_node_binary(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var(product_env_var("NODE")) {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }
    let filename = if cfg!(windows) { "node.exe" } else { "node" };
    if cfg!(debug_assertions) {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../agent-runtime/dist")
            .join(filename);
        if path.is_file() {
            return Ok(path);
        }
    }
    for candidate in [
        format!("_up_/agent-runtime/dist/{filename}"),
        format!("agent-runtime/dist/{filename}"),
        format!("dist/{filename}"),
        filename.to_string(),
    ] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位 Node 运行时失败：{error}"))?;
        if path.is_file() {
            return Ok(path);
        }
    }
    Err("未找到应用内置 Node 运行时，请先构建 Agent Runtime".to_string())
}

fn resolve_pnpm_cli(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var(product_env_var("PNPM")) {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }
    if cfg!(debug_assertions) {
        for path in [
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../agent-runtime/dist/application-installer/pnpm/bin/pnpm.cjs"),
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../node_modules/pnpm/bin/pnpm.cjs"),
        ] {
            if path.is_file() {
                return Ok(path);
            }
        }
    }
    for candidate in [
        "_up_/agent-runtime/dist/application-installer/pnpm/bin/pnpm.cjs",
        "agent-runtime/dist/application-installer/pnpm/bin/pnpm.cjs",
        "dist/application-installer/pnpm/bin/pnpm.cjs",
        "application-installer/pnpm/bin/pnpm.cjs",
    ] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位应用安装器失败：{error}"))?;
        if path.is_file() {
            return Ok(path);
        }
    }
    Err("未找到应用内置应用安装器，请重新构建桌面端".to_string())
}

#[cfg(windows)]
pub(crate) fn hide_subprocess_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x08000000);
}

#[cfg(not(windows))]
pub(crate) fn hide_subprocess_window(_command: &mut Command) {}

fn validate_marketplace_full_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    let parts = value.split('/').collect::<Vec<_>>();
    if parts.len() != 2 || parts.iter().any(|part| !is_safe_registry_segment(part)) {
        return Err("市场应用标识必须是 owner/repository".to_string());
    }
    Ok(value.to_string())
}

fn validate_npm_package_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    let valid = if let Some(scoped) = value.strip_prefix('@') {
        let parts = scoped.split('/').collect::<Vec<_>>();
        parts.len() == 2 && parts.iter().all(|part| is_safe_registry_segment(part))
    } else {
        !value.contains('/') && is_safe_registry_segment(value)
    };
    if !valid || value.len() > 214 {
        return Err("市场返回了不安全的 npm 包名".to_string());
    }
    Ok(value.to_string())
}

fn is_safe_registry_segment(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

fn npm_package_path(node_modules: &Path, package: &str) -> Result<PathBuf, String> {
    let path = package
        .split('/')
        .fold(node_modules.to_path_buf(), |path, segment| {
            path.join(segment)
        });
    let root = node_modules
        .canonicalize()
        .map_err(|error| format!("无法定位已下载的应用依赖：{error}"))?;
    let path = path
        .canonicalize()
        .map_err(|error| format!("下载完成后未找到应用包 {package}：{error}"))?;
    if !path.starts_with(&root) || !path.is_dir() {
        return Err("应用包路径越过了安装暂存目录".to_string());
    }
    Ok(path)
}

fn enforce_install_limits(root: &Path) -> Result<(), String> {
    fn visit(path: &Path, files: &mut usize, bytes: &mut u64) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(|error| format!("无法检查应用依赖目录：{error}"))?
        {
            let entry = entry.map_err(|error| format!("无法检查应用依赖项：{error}"))?;
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|error| format!("无法检查应用依赖信息：{error}"))?;
            if metadata.file_type().is_symlink() {
                *files += 1;
            } else if metadata.is_dir() {
                visit(&entry.path(), files, bytes)?;
            } else if metadata.is_file() {
                *files += 1;
                *bytes = bytes.saturating_add(metadata.len());
            } else {
                return Err("应用依赖包含不支持的文件类型".to_string());
            }
            if *files > MAX_INSTALL_FILES || *bytes > MAX_INSTALL_BYTES {
                return Err(format!(
                    "应用及依赖超过限制（最多 {MAX_INSTALL_FILES} 个文件、{} MiB）",
                    MAX_INSTALL_BYTES / 1024 / 1024
                ));
            }
        }
        Ok(())
    }

    let mut files = 0;
    let mut bytes = 0;
    visit(root, &mut files, &mut bytes)
}

fn list_applications_at(
    bundled_root: Option<&Path>,
    app_root: &Path,
) -> Result<Vec<ApplicationDescriptor>, String> {
    let registry = read_registry(app_root)?;
    let mut applications = HashMap::<String, ApplicationDescriptor>::new();
    if let Some(root) = bundled_root {
        for application in scan_application_root(root, ApplicationSource::Bundled)? {
            applications.insert(application.id.clone(), application);
        }
    }
    for application in scan_installed_applications(app_root)? {
        applications.insert(application.id.clone(), application);
    }
    let mut applications = applications
        .into_values()
        .map(|mut application| {
            application.enabled =
                if application.permission_status == ApplicationPermissionStatus::IsleUpgradeRequired {
                    false
                } else {
                    registry
                        .enabled
                        .get(&application.id)
                        .copied()
                        .unwrap_or(application.default_enabled)
                };
            application
        })
        .collect::<Vec<_>>();
    applications.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(applications)
}

fn scan_application_root(root: &Path, source: ApplicationSource) -> Result<Vec<ApplicationDescriptor>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut paths = fs::read_dir(root)
        .map_err(|error| format!("无法读取应用目录 {}：{error}", root.to_string_lossy()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取应用目录项：{error}"))?;
    paths.sort_by_key(|entry| entry.file_name());

    let mut applications = Vec::new();
    for entry in paths {
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法读取应用目录类型：{error}"))?;
        if file_type.is_symlink() {
            return Err(format!(
                "应用目录不允许使用符号链接：{}",
                entry.path().to_string_lossy()
            ));
        }
        if file_type.is_dir() {
            applications.push(read_package(&entry.path(), source)?);
        }
    }
    Ok(applications)
}

fn read_package(root: &Path, source: ApplicationSource) -> Result<ApplicationDescriptor, String> {
    let manifest_path = root.join("package.json");
    let manifest_text = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("无法读取 {}：{error}", manifest_path.to_string_lossy()))?;
    let manifest: PackageManifest = serde_json::from_str(&manifest_text)
        .map_err(|error| format!("应用 package.json 无效：{error}"))?;
    let id = manifest.name.trim().to_string();
    if id.is_empty() {
        return Err("应用 package.json 缺少 name".to_string());
    }
    let package_entry = manifest
        .main
        .as_deref()
        .map(str::to_string)
        .or_else(|| manifest.exports.as_ref().and_then(package_root_export));
    let dsh_patch = manifest
        .dsh
        .as_ref()
        .and_then(|dsh| dsh.bundle.as_ref())
        .and_then(|bundle| bundle.patch.as_deref());
    let isle = manifest.isle.unwrap_or_default();
    let permissions_declared = isle.permissions.is_some();
    let permissions = isle.permissions.as_deref().unwrap_or_default().to_vec();
    if permissions
        .iter()
        .collect::<std::collections::HashSet<_>>()
        .len()
        != permissions.len()
    {
        return Err(format!("应用 {id} 的 isle.permissions 不能包含重复项"));
    }
    let (runtime_kind, entry) = if let Some(application) = isle.app.as_ref() {
        if application.version != 1 {
            return Err(format!(
                "应用 {id} 使用了不支持的 Isle 应用协议版本：{}",
                application.version
            ));
        }
        let entry = application.entry.trim();
        if entry.is_empty() {
            return Err(format!("Isle 应用 {id} 缺少 isle.app.entry"));
        }
        (
            ApplicationRuntimeKind::Isle,
            resolve_package_file(root, entry, "Isle 应用入口")?,
        )
    } else if dsh_patch.is_some() {
        let entry = package_entry
            .as_deref()
            .map(|entry| resolve_package_file(root, entry, "DSH 应用入口"))
            .transpose()?
            .unwrap_or_default();
        (ApplicationRuntimeKind::Dsh, entry)
    } else {
        return Err(format!(
            "应用 {id} 缺少 isle.app 声明，也不是可识别的 DSH 兼容应用"
        ));
    };
    let permission_status = if permissions_declared {
        ApplicationPermissionStatus::Declared
    } else if runtime_kind == ApplicationRuntimeKind::Isle {
        ApplicationPermissionStatus::IsleUpgradeRequired
    } else {
        ApplicationPermissionStatus::DshUnsupported
    };
    if source == ApplicationSource::Bundled
        && permission_status == ApplicationPermissionStatus::IsleUpgradeRequired
    {
        return Err(isle_permissions_upgrade_error(&id));
    }
    let patch_path = dsh_patch
        .map(|patch| resolve_package_file(root, patch, "DSH Cordis patch"))
        .transpose()?;
    let compatibility = patch_path
        .as_ref()
        .map(|_| {
            vec![ApplicationCompatibility {
                adapter: "dsh".to_string(),
            }]
        })
        .unwrap_or_default();
    let origin_path = root.join(".isle-origin.json");
    let origin = if origin_path.is_file() {
        let content = fs::read_to_string(&origin_path)
            .map_err(|error| format!("无法读取应用来源信息：{error}"))?;
        Some(
            serde_json::from_str::<ApplicationOrigin>(&content)
                .map_err(|error| format!("应用来源信息无效：{error}"))?,
        )
    } else {
        None
    };

    Ok(ApplicationDescriptor {
        id: id.clone(),
        name: isle.display_name.unwrap_or(id),
        version: manifest.version,
        description: manifest.description,
        source: source.as_str().to_string(),
        enabled: false,
        default_enabled: isle.default_enabled,
        path: root.to_string_lossy().to_string(),
        runtime_kind,
        entry: entry.to_string_lossy().to_string(),
        dsh_patch: patch_path.map(|path| path.to_string_lossy().to_string()),
        compatibility,
        permissions,
        agent_access: isle.agent_access,
        permission_status,
        origin,
    })
}

fn isle_permissions_upgrade_error(id: &str) -> String {
    format!("Isle 应用 {id} 使用旧版清单：请添加 isle.permissions；没有额外能力时请声明空数组 []")
}

fn require_installable_permissions(application: &ApplicationDescriptor) -> Result<(), String> {
    if application.permission_status == ApplicationPermissionStatus::IsleUpgradeRequired {
        return Err(isle_permissions_upgrade_error(&application.id));
    }
    Ok(())
}

fn initial_install_enabled(application: &ApplicationDescriptor, requested: Option<bool>) -> bool {
    application.runtime_kind == ApplicationRuntimeKind::Isle && requested.unwrap_or(true)
}

fn package_root_export(value: &serde_json::Value) -> Option<String> {
    if let Some(value) = value.as_str() {
        return Some(value.to_string());
    }
    let object = value.as_object()?;
    if let Some(root) = object.get(".") {
        return package_root_export(root);
    }
    for condition in ["node", "import", "default", "require"] {
        if let Some(value) = object.get(condition).and_then(package_root_export) {
            return Some(value);
        }
    }
    None
}

fn resolve_package_file(root: &Path, relative: &str, label: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!("{label} 必须位于应用目录内"));
    }
    let root = root
        .canonicalize()
        .map_err(|error| format!("无法定位应用目录：{error}"))?;
    let path = root
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("无法定位{label}：{error}"))?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err(format!("{label} 必须是应用目录内的文件"));
    }
    Ok(path)
}

fn read_registry(app_root: &Path) -> Result<ApplicationRegistry, String> {
    let path = app_root.join("registry.json");
    if !path.exists() {
        return Ok(ApplicationRegistry {
            schema_version: REGISTRY_SCHEMA_VERSION,
            ..ApplicationRegistry::default()
        });
    }
    let content =
        fs::read_to_string(&path).map_err(|error| format!("无法读取应用注册表：{error}"))?;
    let registry: ApplicationRegistry =
        serde_json::from_str(&content).map_err(|error| format!("应用注册表格式无效：{error}"))?;
    if registry.schema_version != REGISTRY_SCHEMA_VERSION {
        return Err(format!(
            "不支持的应用注册表版本：{}",
            registry.schema_version
        ));
    }
    Ok(registry)
}

fn write_registry(app_root: &Path, registry: &ApplicationRegistry) -> Result<(), String> {
    fs::create_dir_all(app_root).map_err(|error| format!("无法创建应用目录：{error}"))?;
    let path = app_root.join("registry.json");
    let temporary = app_root.join("registry.json.tmp");
    let content = serde_json::to_string_pretty(registry)
        .map_err(|error| format!("无法序列化应用注册表：{error}"))?;
    fs::write(&temporary, format!("{content}\n"))
        .map_err(|error| format!("无法写入应用注册表：{error}"))?;
    match fs::rename(&temporary, &path) {
        Ok(()) => Ok(()),
        Err(first_error) if path.exists() => {
            fs::remove_file(&path).map_err(|error| format!("无法更新应用注册表：{error}"))?;
            fs::rename(&temporary, &path)
                .map_err(|error| format!("无法提交应用注册表：{error}（初始错误：{first_error}）"))
        }
        Err(error) => Err(format!("无法提交应用注册表：{error}")),
    }
}

fn scan_installed_applications(root: &Path) -> Result<Vec<ApplicationDescriptor>, String> {
    // Read legacy packages only so startup migration can discover their identities.
    let mut applications = scan_application_root(&root.join("packages"), ApplicationSource::Installed)?;
    fn visit(root: &Path, path: &Path, applications: &mut Vec<ApplicationDescriptor>, ids: bool) -> Result<(), String> {
        if !path.exists() { return Ok(()); }
        for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            if path == root && matches!(name.as_str(), "data" | "packages" | "pnpm-store") { continue; }
            if name.starts_with('.') && name != ".ids" { continue; }
            let kind = entry.file_type().map_err(|error| error.to_string())?;
            if kind.is_symlink() { return Err(format!("应用目录不允许使用符号链接：{}", entry.path().display())); }
            if !kind.is_dir() { continue; }
            let directory = entry.path();
            if (path == root && name.starts_with('@')) || name == ".ids" {
                visit(root, &directory, applications, name == ".ids")?;
                continue;
            }
            let package = directory.join("package");
            if fs::symlink_metadata(&package).is_ok_and(|info| info.file_type().is_symlink()) {
                return Err(format!("应用包不允许使用符号链接：{}", package.display()));
            }
            if package.is_dir() {
                let application = read_package(&package, ApplicationSource::Installed)?;
                if self::paths::application_directory(root, &application.id) != directory {
                    return Err(format!("应用目录与包 ID 不匹配：{}", directory.display()));
                }
                applications.push(application);
            }
            if ids && name.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                visit(root, &directory, applications, true)?;
            }
        }
        Ok(())
    }
    visit(root, root, &mut applications, false)?;
    Ok(applications)
}

fn create_install_directory(root: &Path, directory: &Path) -> Result<(), String> {
    self::data::check_paths(root, directory).map_err(|error| error.to_string())?;
    fs::create_dir_all(directory).map_err(|error| format!("无法创建应用安装目录：{error}"))?;
    self::data::check_paths(root, directory).map_err(|error| error.to_string())
}

fn copy_application_tree(source: &Path, destination: &Path) -> Result<(), String> {
    let mut file_count = 0usize;
    let mut byte_count = 0u64;
    copy_application_directory(source, destination, &mut file_count, &mut byte_count)
}

fn copy_application_directory(
    source: &Path,
    destination: &Path,
    file_count: &mut usize,
    byte_count: &mut u64,
) -> Result<(), String> {
    let mut entries = fs::read_dir(source)
        .map_err(|error| format!("无法读取应用源目录：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取应用源目录项：{error}"))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法读取应用源文件类型：{error}"))?;
        if file_type.is_symlink() {
            return Err(format!(
                "应用包不允许包含符号链接：{}",
                entry.path().to_string_lossy()
            ));
        }
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            fs::create_dir(&target).map_err(|error| format!("无法创建应用子目录：{error}"))?;
            copy_application_directory(&entry.path(), &target, file_count, byte_count)?;
        } else if file_type.is_file() {
            *file_count += 1;
            let size = entry
                .metadata()
                .map_err(|error| format!("无法读取应用文件信息：{error}"))?
                .len();
            *byte_count = byte_count.saturating_add(size);
            if *file_count > MAX_APPLICATION_FILES || *byte_count > MAX_APPLICATION_BYTES {
                return Err(format!(
                    "应用包超过限制（最多 {MAX_APPLICATION_FILES} 个文件、{} MiB）",
                    MAX_APPLICATION_BYTES / 1024 / 1024
                ));
            }
            fs::copy(entry.path(), target).map_err(|error| format!("无法复制应用文件：{error}"))?;
        } else {
            return Err("应用包包含不支持的文件类型".to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::GzEncoder, Compression};
    use std::{
        io::Write,
        net::TcpListener,
        thread::{self, JoinHandle},
    };

    fn temporary_root(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "isle-app-registry-{label}-{}",
            Uuid::now_v7().simple()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn write_application(root: &Path, id: &str, default_enabled: bool) {
        fs::create_dir_all(root).unwrap();
        fs::write(root.join("index.js"), "export function apply() {}\n").unwrap();
        fs::write(
            root.join("package.json"),
            serde_json::json!({
                "name": id,
                "version": "1.0.0",
                "main": "./index.js",
                "isle": {
                    "defaultEnabled": default_enabled,
                    "app": { "version": 1, "entry": "./index.js" },
                    "permissions": []
                }
            })
            .to_string(),
        )
        .unwrap();
    }

    fn serve_gzip_json_once(json: &str) -> (String, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/api/v1/plugins", listener.local_addr().unwrap());
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(json.as_bytes()).unwrap();
        let body = encoder.finish().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 2048];
            let _ = stream.read(&mut request).unwrap();
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Encoding: gzip\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .unwrap();
            stream.write_all(&body).unwrap();
        });
        (endpoint, handle)
    }

    #[test]
    fn marketplace_search_decodes_gzip_and_nullable_fields() {
        let (endpoint, server) = serve_gzip_json_once(
            r#"{"total":1,"count":1,"results":[{"fullName":"owner/application","name":"application","summaryZh":null,"category":null,"language":null,"license":null}]}"#,
        );

        let result = search_dsh_marketplace_at(&endpoint, "", Some(1), Some(20)).unwrap();
        server.join().unwrap();

        assert_eq!(result.total, 1);
        assert_eq!(result.results.len(), 1);
        assert_eq!(result.results[0].full_name, "owner/application");
        assert_eq!(result.results[0].summary_zh, "");
        assert_eq!(result.results[0].category, "");
        assert_eq!(result.results[0].license, "");
    }

    #[test]
    fn application_installer_failure_keeps_stdout_and_stderr_diagnostics() {
        let detail = application_installer_output(
            b"Progress: resolved 1\r\nERR_PNPM_FETCH_404 package was not found\n",
            b"request failed: HTTP 404\n",
        );

        assert!(detail.contains("pnpm 输出："));
        assert!(detail.contains("ERR_PNPM_FETCH_404"));
        assert!(detail.contains("pnpm 错误："));
        assert!(detail.contains("HTTP 404"));
    }

    #[test]
    fn installed_application_overrides_bundled_package_and_registry_controls_enablement() {
        let root = temporary_root("precedence");
        let bundled = root.join("bundled");
        let app = root.join("app");
        write_application(&bundled.join("sample"), "@test/sample", true);
        write_application(&app.join("@test/sample/package"), "@test/sample", false);

        let applications = list_applications_at(Some(&bundled), &app).unwrap();
        assert_eq!(applications.len(), 1);
        assert_eq!(applications[0].source, "installed");
        assert!(!applications[0].enabled);
        assert!(applications[0].path.ends_with("@test/sample/package"));
        // Workspace contents must never be discovered as installed packages.
        write_application(&app.join("@test/sample/workspace/package"), "hidden", false);
        assert_eq!(list_applications_at(Some(&bundled), &app).unwrap().len(), 1);

        let mut registry = read_registry(&app).unwrap();
        registry.enabled.insert("@test/sample".to_string(), true);
        write_registry(&app, &registry).unwrap();
        assert!(list_applications_at(Some(&bundled), &app).unwrap()[0].enabled);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn native_packages_require_an_application_entry() {
        let root = temporary_root("entry-contract");
        write_application(&root, "@test/native-contract", false);
        let path = root.join("package.json");
        let mut manifest: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let isle = manifest["isle"].as_object_mut().unwrap();
        let entry = isle.remove("app").unwrap();
        for unsupported in ["plugin", "extension"] {
            manifest["isle"][unsupported] = entry.clone();
            fs::write(&path, manifest.to_string()).unwrap();
            assert!(read_package(&root, ApplicationSource::Installed)
                .unwrap_err()
                .contains("缺少 isle.app 声明"));
            manifest["isle"].as_object_mut().unwrap().remove(unsupported);
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn package_entry_cannot_escape_application_root() {
        let root = temporary_root("escape");
        let package = root.join("package");
        fs::create_dir_all(&package).unwrap();
        fs::write(root.join("outside.js"), "export function apply() {}\n").unwrap();
        fs::write(package.join("cordis.patch.yml"), "[]\n").unwrap();
        fs::write(
            package.join("package.json"),
            r#"{"name":"escape","main":"../outside.js","dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}"#,
        )
        .unwrap();
        assert!(read_package(&package, ApplicationSource::Installed)
            .unwrap_err()
            .contains("必须位于应用目录内"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn bundle_only_package_does_not_require_a_main_entry() {
        let root = temporary_root("bundle-only");
        let package = root.join("package");
        fs::create_dir_all(&package).unwrap();
        fs::write(
            package.join("cordis.patch.yml"),
            "- insert:\n    - id: nested\n      name: dependency-application\n",
        )
        .unwrap();
        fs::write(
            package.join("package.json"),
            r#"{"name":"bundle-only","dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}"#,
        )
        .unwrap();

        let application = read_package(&package, ApplicationSource::Installed).unwrap();
        assert!(application.entry.is_empty());
        assert_eq!(application.id, "bundle-only");
        assert_eq!(application.runtime_kind, ApplicationRuntimeKind::Dsh);
        assert_eq!(
            application.permission_status,
            ApplicationPermissionStatus::DshUnsupported
        );
        assert!(!initial_install_enabled(&application, Some(true)));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn isle_manifest_is_primary_and_dsh_remains_compatible() {
        let root = temporary_root("dual-target");
        let package = root.join("package");
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("index.js"), "export function apply() {}\n").unwrap();
        fs::write(package.join("cordis.patch.yml"), "[]\n").unwrap();
        fs::write(
            package.join("package.json"),
            r#"{
                "name":"dual-target",
                "main":"./index.js",
                "dsh":{"bundle":{"patch":"./cordis.patch.yml"}},
                "isle":{
                    "app":{"version":1,"entry":"./index.js"},
                    "permissions":["network","application-data","application-workspaces"]
                }
            }"#,
        )
        .unwrap();

        let application = read_package(&package, ApplicationSource::Installed).unwrap();
        assert_eq!(application.runtime_kind, ApplicationRuntimeKind::Isle);
        assert_eq!(application.compatibility[0].adapter, "dsh");
        assert!(application.dsh_patch.is_some());
        assert_eq!(application.permission_status, ApplicationPermissionStatus::Declared);
        assert_eq!(
            application.permissions,
            vec![
                ApplicationPermission::Network,
                ApplicationPermission::ApplicationData,
                ApplicationPermission::ApplicationWorkspaces
            ]
        );
        assert!(initial_install_enabled(&application, Some(true)));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_isle_application_is_disabled_and_cannot_be_imported_again() {
        let root = temporary_root("legacy-isle-permissions");
        let app = root.join("app");
        let package = app.join("packages/legacy");
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("index.js"), "export function apply() {}\n").unwrap();
        fs::write(
            package.join("package.json"),
            r#"{"name":"legacy-application","isle":{"defaultEnabled":true,"app":{"version":1,"entry":"./index.js"}}}"#,
        )
        .unwrap();
        let mut registry = read_registry(&app).unwrap();
        registry.enabled.insert("legacy-application".to_string(), true);
        write_registry(&app, &registry).unwrap();

        let application = list_applications_at(None, &app).unwrap().remove(0);
        assert_eq!(
            application.permission_status,
            ApplicationPermissionStatus::IsleUpgradeRequired
        );
        assert!(!application.enabled);
        assert!(inspect_local_application(package.to_str().unwrap())
            .unwrap_err()
            .contains("请添加 isle.permissions"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn bundled_isle_application_without_permissions_is_rejected() {
        let root = temporary_root("bundled-permissions");
        let package = root.join("package");
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("index.js"), "export function apply() {}\n").unwrap();
        fs::write(
            package.join("package.json"),
            r#"{"name":"bundled-legacy","isle":{"app":{"version":1,"entry":"./index.js"}}}"#,
        )
        .unwrap();

        assert!(read_package(&package, ApplicationSource::Bundled)
            .unwrap_err()
            .contains("请添加 isle.permissions"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn duplicate_or_unknown_permissions_are_rejected() {
        let root = temporary_root("invalid-permissions");
        let package = root.join("package");
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("index.js"), "export function apply() {}\n").unwrap();
        fs::write(
            package.join("package.json"),
            r#"{"name":"invalid","isle":{"app":{"version":1,"entry":"./index.js"},"permissions":["network","network"]}}"#,
        )
        .unwrap();
        assert!(read_package(&package, ApplicationSource::Installed)
            .unwrap_err()
            .contains("不能包含重复项"));

        fs::write(
            package.join("package.json"),
            r#"{"name":"invalid","isle":{"app":{"version":1,"entry":"./index.js"},"permissions":["everything"]}}"#,
        )
        .unwrap();
        assert!(read_package(&package, ApplicationSource::Installed)
            .unwrap_err()
            .contains("unknown variant"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn package_root_export_supports_conditional_exports() {
        let exports = serde_json::json!({
            ".": { "types": "./lib/index.d.ts", "import": "./lib/index.js" }
        });
        assert_eq!(
            package_root_export(&exports).as_deref(),
            Some("./lib/index.js")
        );
    }

    #[test]
    fn marketplace_identifiers_reject_specs_and_paths() {
        assert_eq!(
            validate_npm_package_name("@isle/example").unwrap(),
            "@isle/example"
        );
        assert!(validate_npm_package_name("example@latest").is_err());
        assert!(validate_npm_package_name("github:owner/repo").is_err());
        assert!(validate_npm_package_name("../example").is_err());
        assert!(validate_marketplace_full_name("owner/repo").is_ok());
        assert!(validate_marketplace_full_name("owner/repo/extra").is_err());
    }
}
