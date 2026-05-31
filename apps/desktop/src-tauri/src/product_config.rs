use serde::Deserialize;
use std::sync::OnceLock;

const CONFIG_JSON: &str = include_str!("../../product.config.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductConfig {
    #[cfg(test)]
    pub bundle_name: String,
    pub app_data_dir_name: String,
    pub default_workspace_dir_name: String,
    pub env_prefix: String,
}

pub fn product_config() -> &'static ProductConfig {
    static CONFIG: OnceLock<ProductConfig> = OnceLock::new();
    CONFIG.get_or_init(|| {
        serde_json::from_str(CONFIG_JSON).expect("apps/desktop/product.config.json is invalid")
    })
}

pub fn app_data_dir_name() -> &'static str {
    &product_config().app_data_dir_name
}

#[cfg(test)]
pub fn bundle_name() -> &'static str {
    &product_config().bundle_name
}

pub fn default_workspace_dir_name() -> &'static str {
    &product_config().default_workspace_dir_name
}

pub fn product_env_var(name: &str) -> String {
    format!("{}_{}", product_config().env_prefix, name)
}
