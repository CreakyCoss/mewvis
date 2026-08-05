use crate::db::config_db::EmbeddingProfile;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug)]
pub struct ResolvedEmbeddingProfile {
    pub profile: EmbeddingProfile,
}

pub trait TextEmbeddingProvider {
    fn embed_texts(
        &self,
        profile: &ResolvedEmbeddingProfile,
        texts: &[String],
    ) -> Result<Vec<Vec<f32>>, String>;
}

pub struct OpenAiCompatibleEmbeddingProvider {
    client: Client,
    local_client: Client,
}

impl OpenAiCompatibleEmbeddingProvider {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|error| format!("无法初始化 Embedding 客户端：{error}"))?;
        let local_client = Client::builder()
            .timeout(Duration::from_secs(600))
            .no_proxy()
            .build()
            .map_err(|error| format!("无法初始化本地 Embedding 客户端：{error}"))?;
        Ok(Self {
            client,
            local_client,
        })
    }
}

impl TextEmbeddingProvider for OpenAiCompatibleEmbeddingProvider {
    fn embed_texts(
        &self,
        profile: &ResolvedEmbeddingProfile,
        texts: &[String],
    ) -> Result<Vec<Vec<f32>>, String> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        match profile.profile.provider_kind.as_str() {
            "ollama" => self.embed_ollama_texts(profile, texts),
            _ => self.embed_openai_compatible_texts(profile, texts),
        }
    }
}

impl OpenAiCompatibleEmbeddingProvider {
    fn embed_openai_compatible_texts(
        &self,
        profile: &ResolvedEmbeddingProfile,
        texts: &[String],
    ) -> Result<Vec<Vec<f32>>, String> {
        let endpoint = embedding_endpoint(profile.profile.base_url.as_deref());
        let api_key = profile
            .profile
            .api_key
            .as_deref()
            .filter(|value| !value.trim().is_empty());

        let mut request = self.client.post(&endpoint).json(&OpenAiEmbeddingRequest {
            model: profile.profile.model_id.as_str(),
            input: texts,
        });
        if let Some(api_key) = api_key {
            request = request.bearer_auth(api_key);
        }

        let response = request
            .send()
            .map_err(|error| format!("Embedding 请求失败：{error}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            return Err(format!(
                "Embedding 请求失败：HTTP {status}，endpoint: {endpoint}，响应：{body}"
            ));
        }

        let mut body = response
            .json::<OpenAiEmbeddingResponse>()
            .map_err(|error| format!("无法解析 Embedding 响应：{error}"))?;
        body.data.sort_by_key(|item| item.index);

        let embeddings = body
            .data
            .into_iter()
            .map(|item| item.embedding)
            .collect::<Vec<_>>();
        validate_embeddings(profile, texts, &embeddings)?;
        Ok(embeddings)
    }

    fn embed_ollama_texts(
        &self,
        profile: &ResolvedEmbeddingProfile,
        texts: &[String],
    ) -> Result<Vec<Vec<f32>>, String> {
        let endpoints = ollama_embedding_endpoints(profile.profile.base_url.as_deref());
        let mut send_errors = Vec::new();
        for endpoint in endpoints {
            match self.send_ollama_embedding_request(&endpoint, profile, texts) {
                Ok(embeddings) => return Ok(embeddings),
                Err(OllamaEmbeddingError::Transport(error)) => {
                    send_errors.push(format!("{endpoint}: {error}"));
                }
                Err(OllamaEmbeddingError::Http(error)) => return Err(error),
            }
        }

        Err(format!(
            "Embedding 请求失败：无法连接本地 Ollama。已尝试：{}",
            send_errors.join("；")
        ))
    }

    fn send_ollama_embedding_request(
        &self,
        endpoint: &str,
        profile: &ResolvedEmbeddingProfile,
        texts: &[String],
    ) -> Result<Vec<Vec<f32>>, OllamaEmbeddingError> {
        let response = self
            .local_client
            .post(endpoint)
            .json(&OllamaEmbeddingRequest {
                model: profile.profile.model_id.as_str(),
                input: texts,
            })
            .send()
            .map_err(|error| OllamaEmbeddingError::Transport(describe_reqwest_error(error)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            return Err(OllamaEmbeddingError::Http(format!(
                "Embedding 请求失败：HTTP {status}，endpoint: {endpoint}，响应：{body}"
            )));
        }

        let body = response
            .json::<OllamaEmbeddingResponse>()
            .map_err(|error| {
                OllamaEmbeddingError::Http(format!("无法解析 Embedding 响应：{error}"))
            })?;
        let embeddings = body
            .embeddings
            .or_else(|| body.embedding.map(|item| vec![item]))
            .ok_or_else(|| {
                OllamaEmbeddingError::Http("Ollama Embedding 响应缺少 embeddings 字段".to_string())
            })?;
        validate_embeddings(profile, texts, &embeddings).map_err(OllamaEmbeddingError::Http)?;
        Ok(embeddings)
    }
}

pub fn default_embedding_provider() -> Result<Box<dyn TextEmbeddingProvider>, String> {
    Ok(Box::new(OpenAiCompatibleEmbeddingProvider::new()?))
}

pub fn prepare_embedding_query(model_id: &str, query: &str) -> String {
    if uses_embeddinggemma_prompts(model_id) {
        format!("task: search result | query: {}", query.trim())
    } else {
        query.trim().to_string()
    }
}

pub fn prepare_embedding_document(model_id: &str, title: &str, content: &str) -> String {
    if uses_embeddinggemma_prompts(model_id) {
        let title = title.trim();
        let title = if title.is_empty() { "none" } else { title };
        format!("title: {title} | text: {}", content.trim())
    } else {
        content.trim().to_string()
    }
}

fn uses_embeddinggemma_prompts(model_id: &str) -> bool {
    model_id
        .rsplit('/')
        .next()
        .unwrap_or(model_id)
        .to_ascii_lowercase()
        .starts_with("embeddinggemma")
}

fn embedding_endpoint(base_url: Option<&str>) -> String {
    let mut base_url = base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("https://api.openai.com/v1")
        .trim_end_matches('/')
        .to_string();

    for suffix in [
        "/chat/completions",
        "/responses",
        "/completions",
        "/embeddings",
    ] {
        if base_url.ends_with(suffix) {
            base_url.truncate(base_url.len() - suffix.len());
            base_url = base_url.trim_end_matches('/').to_string();
            break;
        }
    }

    if base_url == "https://api.openai.com" {
        base_url.push_str("/v1");
    }

    format!("{base_url}/embeddings")
}

fn ollama_embedding_endpoints(base_url: Option<&str>) -> Vec<String> {
    let mut base_url = base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("http://127.0.0.1:11434")
        .trim_end_matches('/')
        .to_string();

    for suffix in ["/api/embed", "/api/embeddings", "/v1/embeddings"] {
        if base_url.ends_with(suffix) {
            base_url.truncate(base_url.len() - suffix.len());
            base_url = base_url.trim_end_matches('/').to_string();
            break;
        }
    }

    let endpoint = format!("{base_url}/api/embed");
    let mut endpoints = vec![endpoint.clone()];
    if endpoint.starts_with("http://localhost:") {
        endpoints.push(endpoint.replacen("http://localhost:", "http://127.0.0.1:", 1));
    } else if endpoint.starts_with("http://127.0.0.1:") {
        endpoints.push(endpoint.replacen("http://127.0.0.1:", "http://localhost:", 1));
    }

    endpoints.sort();
    endpoints.dedup();
    endpoints
}

fn validate_embeddings(
    profile: &ResolvedEmbeddingProfile,
    texts: &[String],
    embeddings: &[Vec<f32>],
) -> Result<(), String> {
    if embeddings.len() != texts.len() {
        return Err("Embedding 响应数量与请求不一致".to_string());
    }

    for embedding in embeddings {
        if embedding.len() != profile.profile.dimensions as usize {
            return Err(format!(
                "Embedding 维度不一致：期望 {}，实际 {}",
                profile.profile.dimensions,
                embedding.len()
            ));
        }
    }

    Ok(())
}

fn describe_reqwest_error(error: reqwest::Error) -> String {
    let mut parts = vec![error.to_string(), format!("{error:?}")];
    let mut source = std::error::Error::source(&error);
    while let Some(error) = source {
        parts.push(error.to_string());
        source = error.source();
    }
    parts.sort();
    parts.dedup();
    parts.join(" | ")
}

#[cfg(test)]
mod tests {
    use super::{
        embedding_endpoint, ollama_embedding_endpoints, prepare_embedding_document,
        prepare_embedding_query,
    };

    #[test]
    fn embeddinggemma_uses_retrieval_prompts() {
        assert_eq!(
            prepare_embedding_query("embeddinggemma:latest", " 谁制作了游戏？ "),
            "task: search result | query: 谁制作了游戏？"
        );
        assert_eq!(
            prepare_embedding_document("embeddinggemma", "第一章", " 正文内容 "),
            "title: 第一章 | text: 正文内容"
        );
    }

    #[test]
    fn generic_embedding_models_keep_plain_text() {
        assert_eq!(
            prepare_embedding_query("text-embedding-3-small", " query "),
            "query"
        );
        assert_eq!(
            prepare_embedding_document("text-embedding-3-small", "ignored", " document "),
            "document"
        );
    }

    #[test]
    fn embedding_endpoint_normalizes_openai_root() {
        assert_eq!(
            embedding_endpoint(Some("https://api.openai.com")),
            "https://api.openai.com/v1/embeddings"
        );
    }

    #[test]
    fn embedding_endpoint_normalizes_chat_endpoint() {
        assert_eq!(
            embedding_endpoint(Some("https://api.example.com/v1/chat/completions")),
            "https://api.example.com/v1/embeddings"
        );
    }

    #[test]
    fn embedding_endpoint_keeps_v1_root() {
        assert_eq!(
            embedding_endpoint(Some("https://api.example.com/v1")),
            "https://api.example.com/v1/embeddings"
        );
    }

    #[test]
    fn ollama_embedding_endpoint_defaults_to_loopback_ip() {
        assert_eq!(
            ollama_embedding_endpoints(None).first().map(String::as_str),
            Some("http://127.0.0.1:11434/api/embed")
        );
    }

    #[test]
    fn ollama_embedding_endpoint_normalizes_existing_embed_path() {
        assert_eq!(
            ollama_embedding_endpoints(Some("http://localhost:11434/api/embed"))
                .first()
                .map(String::as_str),
            Some("http://127.0.0.1:11434/api/embed")
        );
    }

    #[test]
    fn ollama_embedding_endpoints_include_localhost_fallback() {
        assert_eq!(
            ollama_embedding_endpoints(Some("http://127.0.0.1:11434")),
            vec![
                "http://127.0.0.1:11434/api/embed".to_string(),
                "http://localhost:11434/api/embed".to_string()
            ]
        );
    }
}

#[derive(Debug, Serialize)]
struct OpenAiEmbeddingRequest<'a> {
    model: &'a str,
    input: &'a [String],
}

#[derive(Debug, Deserialize)]
struct OpenAiEmbeddingResponse {
    data: Vec<OpenAiEmbeddingData>,
}

#[derive(Debug, Deserialize)]
struct OpenAiEmbeddingData {
    index: usize,
    embedding: Vec<f32>,
}

#[derive(Debug, Serialize)]
struct OllamaEmbeddingRequest<'a> {
    model: &'a str,
    input: &'a [String],
}

#[derive(Debug, Deserialize)]
struct OllamaEmbeddingResponse {
    embeddings: Option<Vec<Vec<f32>>>,
    embedding: Option<Vec<f32>>,
}

enum OllamaEmbeddingError {
    Transport(String),
    Http(String),
}
