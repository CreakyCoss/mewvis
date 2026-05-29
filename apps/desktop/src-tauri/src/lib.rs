mod commands;
pub mod db;

use commands::{
    agent_runtime::{
        abort_agent_runtime_agent, answer_agent_runtime_question, list_agent_runtime_agents,
        run_agent_runtime_agent, run_agent_runtime_chat, AgentRuntimeAgentTasks,
    },
    agents::{delete_ai_agent, get_ai_agent_settings, save_ai_agent},
    chat_sessions::{
        delete_chat_session, list_chat_sessions, load_chat_session, save_chat_session,
    },
    llm::{get_llm_settings, save_llm_settings},
    skills::{get_workspace_skills, save_workspace_skills},
    workspace::{create_workspace, get_workspace_overview},
    workspace_files::{list_workspace_files, read_workspace_file, write_workspace_file},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AgentRuntimeAgentTasks::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            db::migrate::initialize_config_database(app.handle())
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_workspace_overview,
            create_workspace,
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
            list_workspace_files,
            read_workspace_file,
            write_workspace_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
