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

use crate::product_config::{app_data_dir_name, product_env_var};

const REGISTRY_SCHEMA_VERSION: u32 = 1;
const MAX_PLUGIN_FILES: usize = 20_000;
const MAX_PLUGIN_BYTES: u64 = 256 * 1024 * 1024;
const MAX_INSTALL_FILES: usize = 100_000;
const MAX_INSTALL_BYTES: u64 = 768 * 1024 * 1024;
const MAX_MARKETPLACE_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;
const DSH_MARKETPLACE_API: &str = "https://dshmarketplace.dev/api/v1/plugins";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PluginRuntimeKind {
    Isle,
    Dsh,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PluginCompatibility {
    pub adapter: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PluginPermission {
    Network,
    PluginData,
    WorkspaceFiles,
    OpenExternal,
    Process,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PluginPermissionStatus {
    Declared,
    IsleUpgradeRequired,
    DshUnsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PluginDescriptor {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub source: String,
    pub enabled: bool,
    pub default_enabled: bool,
    pub path: String,
    pub runtime_kind: PluginRuntimeKind,
    pub entry: String,
    #[serde(skip_serializing)]
    pub dsh_patch: Option<String>,
    pub compatibility: Vec<PluginCompatibility>,
    pub permissions: Vec<PluginPermission>,
    pub permission_status: PluginPermissionStatus,
    pub origin: Option<PluginOrigin>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PluginOrigin {
    pub kind: String,
    pub marketplace: String,
    pub full_name: String,
    pub package: String,
    pub repo_url: String,
}

#[derive(Debug, Clone)]
pub(crate) struct RuntimePlugin {
    pub kind: PluginRuntimeKind,
    pub id: String,
    pub entry: String,
    pub package_root: String,
    pub patch_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemovedPlugin {
    pub id: String,
    pub path: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarketplacePlugin {
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
    pub results: Vec<MarketplacePlugin>,
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
pub(crate) struct InstallMarketplacePluginRequest {
    pub provider: String,
    pub full_name: String,
    pub npm_package: String,
    #[serde(default)]
    pub repo_url: String,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginRegistry {
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
    plugin: Option<IslePluginManifest>,
    permissions: Option<Vec<PluginPermission>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IslePluginManifest {
    version: u32,
    entry: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PluginSource {
    Bundled,
    Installed,
}

impl PluginSource {
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

pub(crate) fn list_plugins(app: &AppHandle) -> Result<Vec<PluginDescriptor>, String> {
    let bundled_root = bundled_plugins_path(app)?;
    let app_root = app_plugins_root(app)?;
    list_plugins_at(bundled_root.as_deref(), &app_root)
}

pub(crate) fn settings_location(app: &AppHandle) -> Result<String, String> {
    Ok(app_plugins_root(app)?.to_string_lossy().to_string())
}

pub(crate) fn enabled_runtime_plugins(app: &AppHandle) -> Result<Vec<RuntimePlugin>, String> {
    Ok(list_plugins(app)?
        .into_iter()
        .filter(|plugin| plugin.enabled)
        .map(|plugin| RuntimePlugin {
            kind: plugin.runtime_kind,
            id: plugin.id.clone(),
            entry: plugin.entry,
            package_root: plugin.path,
            patch_path: plugin.dsh_patch,
        })
        .collect())
}

pub(crate) fn install_local_plugin(
    app: &AppHandle,
    source_path: &str,
    enable: Option<bool>,
) -> Result<PluginDescriptor, String> {
    let source_path = source_path.trim();
    if source_path.is_empty() {
        return Err("插件源目录不能为空".to_string());
    }

    let source_root = PathBuf::from(source_path)
        .canonicalize()
        .map_err(|error| format!("无法定位插件源目录：{error}"))?;
    if !source_root.is_dir() {
        return Err("插件源必须是目录".to_string());
    }
    let package = read_package(&source_root, PluginSource::Installed)?;
    require_installable_permissions(&package)?;
    let app_root = app_plugins_root(app)?;
    let packages_root = app_root.join("packages");
    if packages_root.starts_with(&source_root) {
        return Err("插件源目录不能包含应用插件安装目录".to_string());
    }
    fs::create_dir_all(&packages_root).map_err(|error| format!("无法创建插件安装目录：{error}"))?;

    let directory_name = safe_plugin_directory_name(&package.id)?;
    let destination = packages_root.join(&directory_name);
    if destination.exists() {
        return Err(format!("插件已经安装：{}", package.id));
    }

    let staging = packages_root.join(format!(
        ".install-{directory_name}-{}",
        Uuid::now_v7().simple()
    ));
    fs::create_dir(&staging).map_err(|error| format!("无法创建插件暂存目录：{error}"))?;
    if let Err(error) = copy_plugin_tree(&source_root, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    if let Err(error) = read_package(&staging, PluginSource::Installed)
        .and_then(|plugin| require_installable_permissions(&plugin))
    {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    if let Err(error) = fs::rename(&staging, &destination) {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("无法完成插件安装：{error}"));
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

    list_plugins(app)?
        .into_iter()
        .find(|plugin| plugin.id == package.id)
        .ok_or_else(|| "插件已安装，但注册表未能重新发现它".to_string())
}

pub(crate) fn inspect_local_plugin(source_path: &str) -> Result<PluginDescriptor, String> {
    let source_path = source_path.trim();
    if source_path.is_empty() {
        return Err("插件源目录不能为空".to_string());
    }
    let source_root = PathBuf::from(source_path)
        .canonicalize()
        .map_err(|error| format!("无法定位插件源目录：{error}"))?;
    if !source_root.is_dir() {
        return Err("插件源必须是目录".to_string());
    }
    let plugin = read_package(&source_root, PluginSource::Installed)?;
    require_installable_permissions(&plugin)?;
    Ok(plugin)
}

pub(crate) fn search_marketplace(
    provider: &str,
    query: &str,
    page: Option<u32>,
    limit: Option<u32>,
) -> Result<MarketplaceSearchResult, String> {
    if provider != "dsh-community" {
        return Err(format!("不支持的插件市场来源：{provider}"));
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

pub(crate) fn install_marketplace_plugin(
    app: &AppHandle,
    request: InstallMarketplacePluginRequest,
) -> Result<PluginDescriptor, String> {
    if request.provider != "dsh-community" {
        return Err(format!("不支持的插件市场来源：{}", request.provider));
    }
    let full_name = validate_marketplace_full_name(&request.full_name)?;
    let npm_package = validate_npm_package_name(&request.npm_package)?;
    let app_root = app_plugins_root(app)?;
    let packages_root = app_root.join("packages");
    fs::create_dir_all(&packages_root).map_err(|error| format!("无法创建插件安装目录：{error}"))?;

    if list_plugins(app)?
        .iter()
        .any(|plugin| plugin.id == npm_package)
    {
        return Err(format!("插件已经安装或已由应用内置：{npm_package}"));
    }

    let work = app_root.join(format!(".market-install-{}", Uuid::now_v7().simple()));
    fs::create_dir_all(&work).map_err(|error| format!("无法创建市场安装暂存目录：{error}"))?;
    let result = install_dsh_marketplace_plugin_in(
        app,
        &app_root,
        &packages_root,
        &work,
        &full_name,
        &npm_package,
        &request.repo_url,
    );
    let _ = fs::remove_dir_all(&work);
    result
}

fn install_dsh_marketplace_plugin_in(
    app: &AppHandle,
    app_root: &Path,
    packages_root: &Path,
    work: &Path,
    full_name: &str,
    npm_package: &str,
    repo_url: &str,
) -> Result<PluginDescriptor, String> {
    fs::write(
        work.join("package.json"),
        "{\n  \"name\": \"isle-plugin-install\",\n  \"private\": true,\n  \"type\": \"module\"\n}\n",
    )
    .map_err(|error| format!("无法准备市场插件安装：{error}"))?;
    let npmrc = work.join(".npmrc");
    fs::write(
        &npmrc,
        "registry=https://registry.npmjs.org/\nignore-scripts=true\nnode-linker=hoisted\npackage-import-method=copy\n",
    )
    .map_err(|error| format!("无法准备市场插件安装配置：{error}"))?;

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
        .map_err(|error| format!("无法启动安全插件安装器：{error}"))?;
    if !output.status.success() {
        let detail = plugin_installer_output(&output.stdout, &output.stderr);
        return Err(format!(
            "插件 {npm_package} 依赖下载失败（未执行安装脚本）：{}{}",
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
    let package = read_package(&installed_package, PluginSource::Installed)?;
    require_installable_permissions(&package)?;
    if list_plugins(app)?
        .iter()
        .any(|plugin| plugin.id == package.id)
    {
        return Err(format!("插件已经安装或已由应用内置：{}", package.id));
    }

    let directory_name = safe_plugin_directory_name(&package.id)?;
    let destination = packages_root.join(&directory_name);
    if destination.exists() {
        return Err(format!("插件安装目录已经存在：{}", package.id));
    }
    let staging = packages_root.join(format!(
        ".install-{directory_name}-{}",
        Uuid::now_v7().simple()
    ));
    fs::create_dir(&staging).map_err(|error| format!("无法创建插件暂存目录：{error}"))?;

    let stage_result = (|| {
        copy_plugin_tree(&installed_package, &staging)?;
        fs::rename(work.join("node_modules"), staging.join("node_modules"))
            .map_err(|error| format!("无法保存插件依赖：{error}"))?;
        if work.join("pnpm-lock.yaml").is_file() {
            fs::copy(work.join("pnpm-lock.yaml"), staging.join("pnpm-lock.yaml"))
                .map_err(|error| format!("无法保存插件依赖锁文件：{error}"))?;
        }
        let origin = PluginOrigin {
            kind: "marketplace".to_string(),
            marketplace: "dshmarketplace.dev".to_string(),
            full_name: full_name.to_string(),
            package: npm_package.to_string(),
            repo_url: repo_url.trim().to_string(),
        };
        let origin_json = serde_json::to_string_pretty(&origin)
            .map_err(|error| format!("无法记录插件来源：{error}"))?;
        fs::write(
            staging.join(".isle-origin.json"),
            format!("{origin_json}\n"),
        )
        .map_err(|error| format!("无法记录插件来源：{error}"))?;
        let staged = read_package(&staging, PluginSource::Installed)?;
        require_installable_permissions(&staged)?;
        fs::rename(&staging, &destination).map_err(|error| format!("无法完成插件安装：{error}"))?;
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

    list_plugins(app)?
        .into_iter()
        .find(|plugin| plugin.id == package.id)
        .ok_or_else(|| "插件已安装，但注册表未能重新发现它".to_string())
}

fn plugin_installer_output(stdout: &[u8], stderr: &[u8]) -> String {
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

pub(crate) fn set_plugin_enabled(
    app: &AppHandle,
    id: &str,
    enabled: bool,
) -> Result<PluginDescriptor, String> {
    let id = id.trim();
    if id.is_empty() {
        return Err("插件 ID 不能为空".to_string());
    }
    let plugin = list_plugins(app)?
        .into_iter()
        .find(|plugin| plugin.id == id)
        .ok_or_else(|| format!("没有找到插件：{id}"))?;
    if enabled && plugin.permission_status == PluginPermissionStatus::IsleUpgradeRequired {
        return Err(isle_permissions_upgrade_error(&plugin.id));
    }

    let app_root = app_plugins_root(app)?;
    let mut registry = read_registry(&app_root)?;
    registry.enabled.insert(id.to_string(), enabled);
    write_registry(&app_root, &registry)?;

    list_plugins(app)?
        .into_iter()
        .find(|plugin| plugin.id == id)
        .ok_or_else(|| format!("没有找到插件：{id}"))
}

pub(crate) fn remove_installed_plugin(app: &AppHandle, id: &str) -> Result<RemovedPlugin, String> {
    let id = id.trim();
    let app_root = app_plugins_root(app)?;
    let packages_root = app_root.join("packages");
    let installed = scan_plugin_root(&packages_root, PluginSource::Installed)?;
    let plugin = installed
        .into_iter()
        .find(|plugin| plugin.id == id)
        .ok_or_else(|| format!("没有找到已安装插件：{id}"))?;

    let canonical_root = packages_root
        .canonicalize()
        .map_err(|error| format!("无法定位插件安装目录：{error}"))?;
    let target = PathBuf::from(&plugin.path)
        .canonicalize()
        .map_err(|error| format!("无法定位插件目录：{error}"))?;
    if target == canonical_root
        || !target.starts_with(&canonical_root)
        || target.parent() != Some(canonical_root.as_path())
        || !target.join("package.json").is_file()
    {
        return Err("只允许移除应用插件目录中的完整插件包".to_string());
    }

    fs::remove_dir_all(&target).map_err(|error| format!("无法移除插件：{error}"))?;
    let mut registry = read_registry(&app_root)?;
    registry.enabled.remove(id);
    write_registry(&app_root, &registry)?;

    Ok(RemovedPlugin {
        id: id.to_string(),
        path: target.to_string_lossy().to_string(),
    })
}

fn bundled_plugins_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    if cfg!(debug_assertions) {
        let dev_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../agent-runtime/dist/plugins");
        if dev_path.exists() {
            return Ok(Some(dev_path));
        }
    }

    for candidate in [
        "_up_/agent-runtime/dist/plugins",
        "agent-runtime/dist/plugins",
        "dist/plugins",
        "plugins",
    ] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位内置插件资源失败：{error}"))?;
        if path.exists() {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn app_plugins_root(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("无法获取用户主目录：{error}"))?;
    Ok(home.join(app_data_dir_name()).join("plugins"))
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
                .join("../agent-runtime/dist/plugin-installer/pnpm/bin/pnpm.cjs"),
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../node_modules/pnpm/bin/pnpm.cjs"),
        ] {
            if path.is_file() {
                return Ok(path);
            }
        }
    }
    for candidate in [
        "_up_/agent-runtime/dist/plugin-installer/pnpm/bin/pnpm.cjs",
        "agent-runtime/dist/plugin-installer/pnpm/bin/pnpm.cjs",
        "dist/plugin-installer/pnpm/bin/pnpm.cjs",
        "plugin-installer/pnpm/bin/pnpm.cjs",
    ] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位插件安装器失败：{error}"))?;
        if path.is_file() {
            return Ok(path);
        }
    }
    Err("未找到应用内置插件安装器，请重新构建桌面端".to_string())
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
        return Err("市场插件标识必须是 owner/repository".to_string());
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
        .map_err(|error| format!("无法定位已下载的插件依赖：{error}"))?;
    let path = path
        .canonicalize()
        .map_err(|error| format!("下载完成后未找到插件包 {package}：{error}"))?;
    if !path.starts_with(&root) || !path.is_dir() {
        return Err("插件包路径越过了安装暂存目录".to_string());
    }
    Ok(path)
}

fn enforce_install_limits(root: &Path) -> Result<(), String> {
    fn visit(path: &Path, files: &mut usize, bytes: &mut u64) -> Result<(), String> {
        for entry in fs::read_dir(path).map_err(|error| format!("无法检查插件依赖目录：{error}"))?
        {
            let entry = entry.map_err(|error| format!("无法检查插件依赖项：{error}"))?;
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|error| format!("无法检查插件依赖信息：{error}"))?;
            if metadata.file_type().is_symlink() {
                *files += 1;
            } else if metadata.is_dir() {
                visit(&entry.path(), files, bytes)?;
            } else if metadata.is_file() {
                *files += 1;
                *bytes = bytes.saturating_add(metadata.len());
            } else {
                return Err("插件依赖包含不支持的文件类型".to_string());
            }
            if *files > MAX_INSTALL_FILES || *bytes > MAX_INSTALL_BYTES {
                return Err(format!(
                    "插件及依赖超过限制（最多 {MAX_INSTALL_FILES} 个文件、{} MiB）",
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

fn list_plugins_at(
    bundled_root: Option<&Path>,
    app_root: &Path,
) -> Result<Vec<PluginDescriptor>, String> {
    let registry = read_registry(app_root)?;
    let mut plugins = HashMap::<String, PluginDescriptor>::new();
    if let Some(root) = bundled_root {
        for plugin in scan_plugin_root(root, PluginSource::Bundled)? {
            plugins.insert(plugin.id.clone(), plugin);
        }
    }
    for plugin in scan_plugin_root(&app_root.join("packages"), PluginSource::Installed)? {
        plugins.insert(plugin.id.clone(), plugin);
    }
    let mut plugins = plugins
        .into_values()
        .map(|mut plugin| {
            plugin.enabled =
                if plugin.permission_status == PluginPermissionStatus::IsleUpgradeRequired {
                    false
                } else {
                    registry
                        .enabled
                        .get(&plugin.id)
                        .copied()
                        .unwrap_or(plugin.default_enabled)
                };
            plugin
        })
        .collect::<Vec<_>>();
    plugins.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(plugins)
}

fn scan_plugin_root(root: &Path, source: PluginSource) -> Result<Vec<PluginDescriptor>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut paths = fs::read_dir(root)
        .map_err(|error| format!("无法读取插件目录 {}：{error}", root.to_string_lossy()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取插件目录项：{error}"))?;
    paths.sort_by_key(|entry| entry.file_name());

    let mut plugins = Vec::new();
    for entry in paths {
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法读取插件目录类型：{error}"))?;
        if file_type.is_symlink() {
            return Err(format!(
                "插件目录不允许使用符号链接：{}",
                entry.path().to_string_lossy()
            ));
        }
        if file_type.is_dir() {
            plugins.push(read_package(&entry.path(), source)?);
        }
    }
    Ok(plugins)
}

fn read_package(root: &Path, source: PluginSource) -> Result<PluginDescriptor, String> {
    let manifest_path = root.join("package.json");
    let manifest_text = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("无法读取 {}：{error}", manifest_path.to_string_lossy()))?;
    let manifest: PackageManifest = serde_json::from_str(&manifest_text)
        .map_err(|error| format!("插件 package.json 无效：{error}"))?;
    let id = manifest.name.trim().to_string();
    if id.is_empty() {
        return Err("插件 package.json 缺少 name".to_string());
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
        return Err(format!("插件 {id} 的 isle.permissions 不能包含重复项"));
    }
    let (runtime_kind, entry) = if let Some(plugin) = isle.plugin.as_ref() {
        if plugin.version != 1 {
            return Err(format!(
                "插件 {id} 使用了不支持的 Isle 插件协议版本：{}",
                plugin.version
            ));
        }
        let entry = plugin.entry.trim();
        if entry.is_empty() {
            return Err(format!("Isle 插件 {id} 缺少 isle.plugin.entry"));
        }
        (
            PluginRuntimeKind::Isle,
            resolve_package_file(root, entry, "Isle 插件入口")?,
        )
    } else if dsh_patch.is_some() {
        let entry = package_entry
            .as_deref()
            .map(|entry| resolve_package_file(root, entry, "DSH 插件入口"))
            .transpose()?
            .unwrap_or_default();
        (PluginRuntimeKind::Dsh, entry)
    } else {
        return Err(format!(
            "插件 {id} 缺少 isle.plugin 声明，也不是可识别的 DSH 兼容插件"
        ));
    };
    let permission_status = if permissions_declared {
        PluginPermissionStatus::Declared
    } else if runtime_kind == PluginRuntimeKind::Isle {
        PluginPermissionStatus::IsleUpgradeRequired
    } else {
        PluginPermissionStatus::DshUnsupported
    };
    if source == PluginSource::Bundled
        && permission_status == PluginPermissionStatus::IsleUpgradeRequired
    {
        return Err(isle_permissions_upgrade_error(&id));
    }
    let patch_path = dsh_patch
        .map(|patch| resolve_package_file(root, patch, "DSH Cordis patch"))
        .transpose()?;
    let compatibility = patch_path
        .as_ref()
        .map(|_| {
            vec![PluginCompatibility {
                adapter: "dsh".to_string(),
            }]
        })
        .unwrap_or_default();
    let origin_path = root.join(".isle-origin.json");
    let origin = if origin_path.is_file() {
        let content = fs::read_to_string(&origin_path)
            .map_err(|error| format!("无法读取插件来源信息：{error}"))?;
        Some(
            serde_json::from_str::<PluginOrigin>(&content)
                .map_err(|error| format!("插件来源信息无效：{error}"))?,
        )
    } else {
        None
    };

    Ok(PluginDescriptor {
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
        permission_status,
        origin,
    })
}

fn isle_permissions_upgrade_error(id: &str) -> String {
    format!("Isle 插件 {id} 使用旧版清单：请添加 isle.permissions；没有额外能力时请声明空数组 []")
}

fn require_installable_permissions(plugin: &PluginDescriptor) -> Result<(), String> {
    if plugin.permission_status == PluginPermissionStatus::IsleUpgradeRequired {
        return Err(isle_permissions_upgrade_error(&plugin.id));
    }
    Ok(())
}

fn initial_install_enabled(plugin: &PluginDescriptor, requested: Option<bool>) -> bool {
    plugin.runtime_kind == PluginRuntimeKind::Isle && requested.unwrap_or(true)
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
        return Err(format!("{label} 必须位于插件目录内"));
    }
    let root = root
        .canonicalize()
        .map_err(|error| format!("无法定位插件目录：{error}"))?;
    let path = root
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("无法定位{label}：{error}"))?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err(format!("{label} 必须是插件目录内的文件"));
    }
    Ok(path)
}

fn read_registry(app_root: &Path) -> Result<PluginRegistry, String> {
    let path = app_root.join("registry.json");
    if !path.exists() {
        return Ok(PluginRegistry {
            schema_version: REGISTRY_SCHEMA_VERSION,
            ..PluginRegistry::default()
        });
    }
    let content =
        fs::read_to_string(&path).map_err(|error| format!("无法读取插件注册表：{error}"))?;
    let registry: PluginRegistry =
        serde_json::from_str(&content).map_err(|error| format!("插件注册表格式无效：{error}"))?;
    if registry.schema_version != REGISTRY_SCHEMA_VERSION {
        return Err(format!(
            "不支持的插件注册表版本：{}",
            registry.schema_version
        ));
    }
    Ok(registry)
}

fn write_registry(app_root: &Path, registry: &PluginRegistry) -> Result<(), String> {
    fs::create_dir_all(app_root).map_err(|error| format!("无法创建插件目录：{error}"))?;
    let path = app_root.join("registry.json");
    let temporary = app_root.join("registry.json.tmp");
    let content = serde_json::to_string_pretty(registry)
        .map_err(|error| format!("无法序列化插件注册表：{error}"))?;
    fs::write(&temporary, format!("{content}\n"))
        .map_err(|error| format!("无法写入插件注册表：{error}"))?;
    match fs::rename(&temporary, &path) {
        Ok(()) => Ok(()),
        Err(first_error) if path.exists() => {
            fs::remove_file(&path).map_err(|error| format!("无法更新插件注册表：{error}"))?;
            fs::rename(&temporary, &path)
                .map_err(|error| format!("无法提交插件注册表：{error}（初始错误：{first_error}）"))
        }
        Err(error) => Err(format!("无法提交插件注册表：{error}")),
    }
}

fn safe_plugin_directory_name(id: &str) -> Result<String, String> {
    let value = id
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let value = value.trim_matches(['.', '-']).to_string();
    if value.is_empty() {
        return Err("插件 ID 不能映射为安全的安装目录".to_string());
    }
    Ok(value)
}

fn copy_plugin_tree(source: &Path, destination: &Path) -> Result<(), String> {
    let mut file_count = 0usize;
    let mut byte_count = 0u64;
    copy_plugin_directory(source, destination, &mut file_count, &mut byte_count)
}

fn copy_plugin_directory(
    source: &Path,
    destination: &Path,
    file_count: &mut usize,
    byte_count: &mut u64,
) -> Result<(), String> {
    let mut entries = fs::read_dir(source)
        .map_err(|error| format!("无法读取插件源目录：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取插件源目录项：{error}"))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法读取插件源文件类型：{error}"))?;
        if file_type.is_symlink() {
            return Err(format!(
                "插件包不允许包含符号链接：{}",
                entry.path().to_string_lossy()
            ));
        }
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            fs::create_dir(&target).map_err(|error| format!("无法创建插件子目录：{error}"))?;
            copy_plugin_directory(&entry.path(), &target, file_count, byte_count)?;
        } else if file_type.is_file() {
            *file_count += 1;
            let size = entry
                .metadata()
                .map_err(|error| format!("无法读取插件文件信息：{error}"))?
                .len();
            *byte_count = byte_count.saturating_add(size);
            if *file_count > MAX_PLUGIN_FILES || *byte_count > MAX_PLUGIN_BYTES {
                return Err(format!(
                    "插件包超过限制（最多 {MAX_PLUGIN_FILES} 个文件、{} MiB）",
                    MAX_PLUGIN_BYTES / 1024 / 1024
                ));
            }
            fs::copy(entry.path(), target).map_err(|error| format!("无法复制插件文件：{error}"))?;
        } else {
            return Err("插件包包含不支持的文件类型".to_string());
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
            "isle-plugin-registry-{label}-{}",
            Uuid::now_v7().simple()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn write_plugin(root: &Path, id: &str, default_enabled: bool) {
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
                    "plugin": { "version": 1, "entry": "./index.js" },
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
            r#"{"total":1,"count":1,"results":[{"fullName":"owner/plugin","name":"plugin","summaryZh":null,"category":null,"language":null,"license":null}]}"#,
        );

        let result = search_dsh_marketplace_at(&endpoint, "", Some(1), Some(20)).unwrap();
        server.join().unwrap();

        assert_eq!(result.total, 1);
        assert_eq!(result.results.len(), 1);
        assert_eq!(result.results[0].full_name, "owner/plugin");
        assert_eq!(result.results[0].summary_zh, "");
        assert_eq!(result.results[0].category, "");
        assert_eq!(result.results[0].license, "");
    }

    #[test]
    fn plugin_installer_failure_keeps_stdout_and_stderr_diagnostics() {
        let detail = plugin_installer_output(
            b"Progress: resolved 1\r\nERR_PNPM_FETCH_404 package was not found\n",
            b"request failed: HTTP 404\n",
        );

        assert!(detail.contains("pnpm 输出："));
        assert!(detail.contains("ERR_PNPM_FETCH_404"));
        assert!(detail.contains("pnpm 错误："));
        assert!(detail.contains("HTTP 404"));
    }

    #[test]
    fn installed_plugin_overrides_bundled_package_and_registry_controls_enablement() {
        let root = temporary_root("precedence");
        let bundled = root.join("bundled");
        let app = root.join("app");
        write_plugin(&bundled.join("sample"), "@test/sample", true);
        write_plugin(&app.join("packages/sample"), "@test/sample", false);

        let plugins = list_plugins_at(Some(&bundled), &app).unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].source, "installed");
        assert!(!plugins[0].enabled);

        let mut registry = read_registry(&app).unwrap();
        registry.enabled.insert("@test/sample".to_string(), true);
        write_registry(&app, &registry).unwrap();
        assert!(list_plugins_at(Some(&bundled), &app).unwrap()[0].enabled);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn package_entry_cannot_escape_plugin_root() {
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
        assert!(read_package(&package, PluginSource::Installed)
            .unwrap_err()
            .contains("必须位于插件目录内"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn bundle_only_package_does_not_require_a_main_entry() {
        let root = temporary_root("bundle-only");
        let package = root.join("package");
        fs::create_dir_all(&package).unwrap();
        fs::write(
            package.join("cordis.patch.yml"),
            "- insert:\n    - id: nested\n      name: dependency-plugin\n",
        )
        .unwrap();
        fs::write(
            package.join("package.json"),
            r#"{"name":"bundle-only","dsh":{"bundle":{"patch":"./cordis.patch.yml"}}}"#,
        )
        .unwrap();

        let plugin = read_package(&package, PluginSource::Installed).unwrap();
        assert!(plugin.entry.is_empty());
        assert_eq!(plugin.id, "bundle-only");
        assert_eq!(plugin.runtime_kind, PluginRuntimeKind::Dsh);
        assert_eq!(
            plugin.permission_status,
            PluginPermissionStatus::DshUnsupported
        );
        assert!(!initial_install_enabled(&plugin, Some(true)));
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
                    "plugin":{"version":1,"entry":"./index.js"},
                    "permissions":["network","plugin-data"]
                }
            }"#,
        )
        .unwrap();

        let plugin = read_package(&package, PluginSource::Installed).unwrap();
        assert_eq!(plugin.runtime_kind, PluginRuntimeKind::Isle);
        assert_eq!(plugin.compatibility[0].adapter, "dsh");
        assert!(plugin.dsh_patch.is_some());
        assert_eq!(plugin.permission_status, PluginPermissionStatus::Declared);
        assert_eq!(
            plugin.permissions,
            vec![PluginPermission::Network, PluginPermission::PluginData]
        );
        assert!(initial_install_enabled(&plugin, Some(true)));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_isle_plugin_is_disabled_and_cannot_be_imported_again() {
        let root = temporary_root("legacy-isle-permissions");
        let app = root.join("app");
        let package = app.join("packages/legacy");
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("index.js"), "export function apply() {}\n").unwrap();
        fs::write(
            package.join("package.json"),
            r#"{"name":"legacy-plugin","isle":{"defaultEnabled":true,"plugin":{"version":1,"entry":"./index.js"}}}"#,
        )
        .unwrap();
        let mut registry = read_registry(&app).unwrap();
        registry.enabled.insert("legacy-plugin".to_string(), true);
        write_registry(&app, &registry).unwrap();

        let plugin = list_plugins_at(None, &app).unwrap().remove(0);
        assert_eq!(
            plugin.permission_status,
            PluginPermissionStatus::IsleUpgradeRequired
        );
        assert!(!plugin.enabled);
        assert!(inspect_local_plugin(package.to_str().unwrap())
            .unwrap_err()
            .contains("请添加 isle.permissions"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn bundled_isle_plugin_without_permissions_is_rejected() {
        let root = temporary_root("bundled-permissions");
        let package = root.join("package");
        fs::create_dir_all(&package).unwrap();
        fs::write(package.join("index.js"), "export function apply() {}\n").unwrap();
        fs::write(
            package.join("package.json"),
            r#"{"name":"bundled-legacy","isle":{"plugin":{"version":1,"entry":"./index.js"}}}"#,
        )
        .unwrap();

        assert!(read_package(&package, PluginSource::Bundled)
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
            r#"{"name":"invalid","isle":{"plugin":{"version":1,"entry":"./index.js"},"permissions":["network","network"]}}"#,
        )
        .unwrap();
        assert!(read_package(&package, PluginSource::Installed)
            .unwrap_err()
            .contains("不能包含重复项"));

        fs::write(
            package.join("package.json"),
            r#"{"name":"invalid","isle":{"plugin":{"version":1,"entry":"./index.js"},"permissions":["everything"]}}"#,
        )
        .unwrap();
        assert!(read_package(&package, PluginSource::Installed)
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
