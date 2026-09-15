mod node_backend;

use node_backend::{get_backend_connection, NodeBackend};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(NodeBackend::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_backend_connection])
        .build(tauri::generate_context!())
        .expect("error while building desktop shell")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<NodeBackend>().shutdown();
            }
        });
}
