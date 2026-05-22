mod commands;
pub mod db;

use commands::{
    llm::{get_llm_settings, save_llm_settings},
    workspace::{create_workspace, get_workspace_overview},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            save_llm_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
