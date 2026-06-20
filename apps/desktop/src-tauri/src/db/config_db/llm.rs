use rusqlite::{params, Connection};
use tauri::AppHandle;

use super::{
    common::{normalize_optional_text, normalize_record_id, now_millis},
    connection::open_config_connection,
    inputs::SaveLlmSettingsInput,
    models::{LlmProvider, LlmSettings, ProviderModel},
};

pub fn llm_settings(app: &AppHandle) -> Result<LlmSettings, String> {
    let conn = open_config_connection(app)?;

    Ok(LlmSettings {
        providers: load_llm_providers(&conn)?,
    })
}

pub fn save_llm_settings(
    app: &AppHandle,
    input: SaveLlmSettingsInput,
) -> Result<LlmSettings, String> {
    validate_llm_settings(&input)?;

    let mut conn = open_config_connection(app)?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("无法开始保存 LLM 设置：{error}"))?;
    tx.execute("DELETE FROM llm_providers", [])
        .map_err(|error| format!("无法清空 LLM Provider：{error}"))?;

    let now = now_millis()?;
    let default_index = input
        .providers
        .iter()
        .position(|provider| provider.is_default)
        .unwrap_or(0);

    for (provider_index, provider) in input.providers.iter().enumerate() {
        let provider_id = normalize_record_id(provider.id.as_deref());
        let name = provider.name.trim();
        let provider_name = provider.provider.trim();
        let api_format = provider.api_format.trim();
        let api_key = normalize_optional_text(provider.api_key.as_deref());
        let api_endpoint = normalize_optional_text(provider.api_endpoint.as_deref());
        let is_default = provider_index == default_index;

        tx.execute(
            r#"
            INSERT INTO llm_providers (
                id, name, provider, api_format, api_key, api_endpoint, is_default, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                provider_id,
                name,
                provider_name,
                api_format,
                api_key,
                api_endpoint,
                is_default as i64,
                now,
                now
            ],
        )
        .map_err(|error| format!("无法保存 LLM Provider：{error}"))?;

        for model in &provider.models {
            let model_id = normalize_record_id(model.id.as_deref());
            tx.execute(
                r#"
                INSERT INTO provider_models (
                    id, provider_id, model_id, model_name, is_enabled, is_one_million_context, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
                params![
                    model_id,
                    provider_id,
                    model.model_id.trim(),
                    model.model_name.trim(),
                    model.is_enabled as i64,
                    model.is_one_million_context as i64,
                    now,
                    now
                ],
            )
            .map_err(|error| format!("无法保存 LLM 模型：{error}"))?;
        }
    }

    tx.commit()
        .map_err(|error| format!("无法提交 LLM 设置：{error}"))?;

    llm_settings(app)
}

fn load_llm_providers(conn: &Connection) -> Result<Vec<LlmProvider>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, name, provider, api_format, api_key, api_endpoint, is_default, created_at, updated_at
            FROM llm_providers
            ORDER BY is_default DESC, created_at ASC
            "#,
        )
        .map_err(|error| format!("无法读取 LLM Provider：{error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(LlmProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                provider: row.get(2)?,
                api_format: row.get(3)?,
                api_key: row.get(4)?,
                api_endpoint: row.get(5)?,
                is_default: row.get::<_, i64>(6)? == 1,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                models: Vec::new(),
            })
        })
        .map_err(|error| format!("无法读取 LLM Provider：{error}"))?;

    let mut providers = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 LLM Provider：{error}"))?;

    for provider in &mut providers {
        provider.models = load_provider_models(conn, &provider.id)?;
    }

    Ok(providers)
}

fn load_provider_models(
    conn: &Connection,
    provider_id: &str,
) -> Result<Vec<ProviderModel>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, provider_id, model_id, model_name, is_enabled, is_one_million_context, created_at, updated_at
            FROM provider_models
            WHERE provider_id = ?1
            ORDER BY created_at ASC
            "#,
        )
        .map_err(|error| format!("无法读取 LLM 模型：{error}"))?;

    let rows = statement
        .query_map(params![provider_id], |row| {
            Ok(ProviderModel {
                id: row.get(0)?,
                provider_id: row.get(1)?,
                model_id: row.get(2)?,
                model_name: row.get(3)?,
                is_enabled: row.get::<_, i64>(4)? == 1,
                is_one_million_context: row.get::<_, i64>(5)? == 1,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("无法读取 LLM 模型：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 LLM 模型：{error}"))
}

fn validate_llm_settings(input: &SaveLlmSettingsInput) -> Result<(), String> {
    for provider in &input.providers {
        if provider.name.trim().is_empty() {
            return Err("Provider 名称不能为空".to_string());
        }

        if provider.provider.trim().is_empty() {
            return Err("供应商不能为空".to_string());
        }

        if provider.api_format.trim().is_empty() {
            return Err("API Format 不能为空".to_string());
        }

        for model in &provider.models {
            if model.model_id.trim().is_empty() {
                return Err("模型 ID 不能为空".to_string());
            }

            if model.model_name.trim().is_empty() {
                return Err("模型名称不能为空".to_string());
            }
        }
    }

    Ok(())
}
