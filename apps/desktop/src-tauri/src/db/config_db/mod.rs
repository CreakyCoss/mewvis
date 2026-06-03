mod agents;
mod common;
mod connection;
mod inputs;
mod knowledge;
mod llm;
mod models;
mod skills;
mod workspace;

pub use crate::db::paths::config_db_path;
pub use agents::{ai_agent_settings, delete_ai_agent, save_ai_agent};
pub use inputs::{
    CreateWorkspaceInput, SaveAiAgentInput, SaveEmbeddingProfileInput,
    SaveKnowledgeCollectionInput, SaveKnowledgeSettingsInput, SaveKnowledgeSourceInput,
    SaveLlmProviderInput, SaveLlmSettingsInput, SaveProviderModelInput, SaveWorkspaceSkillsInput,
    SetKnowledgeCollectionSourcesInput, UpdateWorkspaceInput,
};
pub use knowledge::{
    default_embedding_profile, delete_knowledge_collection, delete_knowledge_source,
    embedding_profiles, enabled_knowledge_source_ids, knowledge_library, knowledge_settings,
    save_embedding_profile, save_knowledge_collection, save_knowledge_settings,
    save_knowledge_source, set_knowledge_collection_sources,
};
pub use llm::{llm_settings, save_llm_settings};
pub use models::{
    AiAgent, AiAgentSettings, EmbeddingProfile, KnowledgeCollection, KnowledgeLibrary,
    KnowledgeSettings, KnowledgeSource, LlmProvider, LlmSettings, ProviderModel, Workspace,
    WorkspaceGroup, WorkspaceOverview, WorkspaceSkillSettings,
};
pub use skills::{save_workspace_skill_settings, workspace_skill_settings};
pub use workspace::{create_workspace, overview, update_workspace};
