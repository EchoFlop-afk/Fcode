mod commands;
mod error;
mod models;
mod providers;
mod secrets;
mod security;
mod state;
mod store;
mod tools;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let state = AppState::init(data_dir).map_err(std::io::Error::other)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // chat
            commands::chat::chat_stream,
            commands::chat::cancel_stream,
            commands::chat::estimate_tokens_cmd,
            commands::chat::provider_validate,
            commands::chat::provider_models,
            // settings & conversations
            commands::store::settings_get,
            commands::store::settings_save,
            commands::store::conversation_create,
            commands::store::conversation_save,
            commands::store::conversation_list,
            commands::store::conversation_get,
            commands::store::conversation_delete,
            commands::store::conversation_rename,
            commands::store::conversation_pin,
            commands::store::conversation_search,
            commands::store::conversation_append_messages,
            commands::store::auto_title_cmd,
            // providers & keys
            commands::providers::provider_key_status,
            commands::providers::provider_set_key,
            commands::providers::provider_delete_key,
            commands::providers::provider_add_custom,
            commands::providers::provider_remove,
            // tools
            commands::tools::tool_execute,
            commands::tools::command_risk,
            commands::tools::fs_read,
            commands::tools::fs_read_data_url,
            commands::tools::fs_write,
            commands::tools::fs_list_dir,
            commands::tools::fs_tree,
            commands::tools::fs_search,
            commands::tools::fs_grep,
            commands::tools::fs_delete,
            commands::tools::project_inspect,
            commands::tools::git_status,
            commands::tools::git_diff,
            commands::tools::git_log,
            commands::tools::terminal_run,
            commands::tools::terminal_stop,
            commands::tools::terminal_cwd,
            // usage & quotas
            commands::usage::usage_get,
            commands::usage::usage_reset,
            commands::usage::promotions_list,
            commands::usage::promotions_save,
            commands::usage::quota_check,
            // import / export
            commands::data::export_data,
            commands::data::import_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Fcode");
}
