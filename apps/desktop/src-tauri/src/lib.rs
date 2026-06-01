mod commands;
pub mod db;
mod product_config;
mod services;

use commands::{
    agent_runtime::{
        abort_agent_runtime_agent, answer_agent_runtime_question, list_agent_runtime_agents,
        run_agent_runtime_agent, run_agent_runtime_chat, AgentRuntimeSupervisor,
    },
    app::{
        get_config_database_status, initialize_config_database, rebuild_config_database,
        rebuild_workspace_database, AppStartupState,
    },
    settings::{
        delete_ai_agent, get_ai_agent_settings, get_llm_settings, save_ai_agent, save_llm_settings,
    },
    workspace::{
        cleanup_orphan_agent_sessions, create_workspace, delete_chat_session,
        get_agent_session_status, get_workspace_overview, get_workspace_skills, list_chat_sessions,
        list_workspace_files, load_chat_session, read_workspace_file,
        reset_agent_sessions_for_chat, save_chat_session, save_workspace_skills, update_workspace,
        write_workspace_file,
    },
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AgentRuntimeSupervisor::default())
        .manage(AppStartupState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            initialize_config_database,
            get_config_database_status,
            rebuild_config_database,
            rebuild_workspace_database,
            get_workspace_overview,
            create_workspace,
            update_workspace,
            get_llm_settings,
            save_llm_settings,
            get_ai_agent_settings,
            save_ai_agent,
            delete_ai_agent,
            list_agent_runtime_agents,
            run_agent_runtime_chat,
            run_agent_runtime_agent,
            answer_agent_runtime_question,
            abort_agent_runtime_agent,
            get_workspace_skills,
            save_workspace_skills,
            list_chat_sessions,
            load_chat_session,
            save_chat_session,
            delete_chat_session,
            get_agent_session_status,
            cleanup_orphan_agent_sessions,
            reset_agent_sessions_for_chat,
            list_workspace_files,
            read_workspace_file,
            write_workspace_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
