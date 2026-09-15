use crate::error::{AppError, AppResult};
use crate::security::classify_command;
use crate::state::AppState;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

use crate::models::TerminalEvent;
use crate::tools;

fn resolve_project_root(state: &AppState, root_opt: Option<String>) -> AppResult<std::path::PathBuf> {
    let path = match root_opt {
        Some(r) if !r.is_empty() => r,
        _ => state
            .settings
            .read()
            .unwrap()
            .projects
            .active
            .clone()
            .ok_or_else(|| AppError::not_configured("No project folder is open"))?,
    };
    let p = std::path::PathBuf::from(&path);
    if !p.is_dir() {
        return Err(AppError::bad_request(format!(
            "Project folder does not exist: {path}"
        )));
    }
    Ok(p)
}

/// Executes an agent tool. Permission checks happen in the frontend agent
/// loop; this layer enforces sandboxing and command risk classification.
#[tauri::command]
pub fn tool_execute(
    app: AppHandle,
    name: String,
    args: Value,
    project_root: Option<String>,
    on_output: Channel<TerminalEvent>,
) -> Result<Value, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    let shell = state.settings.read().unwrap().terminal.shell.clone();
    let timeout = state.settings.read().unwrap().terminal.timeout_secs;
    tools::execute(
        &root,
        &name,
        &args,
        &state.terminal,
        &shell,
        timeout,
        on_output,
    )
}

/// Risk classification for a terminal command (used by the approval UI).
#[tauri::command]
pub fn command_risk(command: String) -> String {
    classify_command(&command).as_str().to_string()
}

// ---- Direct (user-driven) filesystem access for the editor / file tree ----
// Sandboxed to the project root, but no approval flow: the user is driving.

#[tauri::command]
pub fn fs_read(
    app: AppHandle,
    path: String,
    project_root: Option<String>,
) -> Result<tools::fs::ReadResult, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::fs::fs_read(&root, &path)
}

#[tauri::command]
pub fn fs_read_data_url(
    app: AppHandle,
    path: String,
    project_root: Option<String>,
) -> Result<tools::fs::ImageData, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::fs::fs_read_data_url(&root, &path)
}

#[tauri::command]
pub fn fs_write(
    app: AppHandle,
    path: String,
    content: String,
    project_root: Option<String>,
) -> Result<u64, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::fs::fs_write(&root, &path, &content)
}

#[tauri::command]
pub fn fs_list_dir(
    app: AppHandle,
    path: String,
    project_root: Option<String>,
) -> Result<Vec<tools::fs::FileEntry>, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::fs::fs_list(&root, &path)
}

#[tauri::command]
pub fn fs_tree(
    app: AppHandle,
    depth: Option<u32>,
    project_root: Option<String>,
) -> Result<Vec<tools::fs::FileEntry>, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::fs::list_tree(&root, "", depth.unwrap_or(3))
}

#[tauri::command]
pub fn fs_search(
    app: AppHandle,
    query: String,
    max_results: Option<u32>,
    project_root: Option<String>,
) -> Result<Vec<tools::fs::FileEntry>, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::fs::fs_search(&root, &query, max_results.unwrap_or(100) as usize)
}

#[tauri::command]
pub fn fs_grep(
    app: AppHandle,
    pattern: String,
    is_regex: Option<bool>,
    max_results: Option<u32>,
    project_root: Option<String>,
) -> Result<Vec<tools::fs::GrepMatch>, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::fs::fs_grep(&root, &pattern, is_regex.unwrap_or(false), max_results.unwrap_or(200) as usize)
}

#[tauri::command]
pub fn fs_delete(
    app: AppHandle,
    path: String,
    recursive: Option<bool>,
    project_root: Option<String>,
) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::fs::fs_delete(&root, &path, recursive.unwrap_or(false))
}

#[tauri::command]
pub fn project_inspect(
    app: AppHandle,
    project_root: Option<String>,
) -> Result<Value, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::project_inspect(&root)
}

// ---- Git ----

#[tauri::command]
pub fn git_status(
    app: AppHandle,
    project_root: Option<String>,
) -> Result<tools::git::GitStatus, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::git::git_status(&root)
}

#[tauri::command]
pub fn git_diff(app: AppHandle, project_root: Option<String>) -> Result<String, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::git::git_diff(&root)
}

#[tauri::command]
pub fn git_log(
    app: AppHandle,
    max: Option<u32>,
    project_root: Option<String>,
) -> Result<Vec<tools::git::GitLogEntry>, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    tools::git::git_log(&root, max.unwrap_or(20))
}

// ---- Terminal (UI sessions) ----

#[tauri::command]
pub fn terminal_run(
    app: AppHandle,
    session_id: String,
    command: String,
    on_event: Channel<TerminalEvent>,
    project_root: Option<String>,
) -> Result<tools::terminal::TerminalInfo, AppError> {
    let state = app.state::<AppState>();
    let root = resolve_project_root(state.inner(), project_root)?;
    let shell = state.settings.read().unwrap().terminal.shell.clone();
    state.terminal.run(&session_id, &root, &shell, &command, None, on_event)
}

#[tauri::command]
pub fn terminal_stop(app: AppHandle, session_id: String) -> Result<(), AppError> {
    app.state::<AppState>().terminal.stop(&session_id);
    Ok(())
}

#[tauri::command]
pub fn terminal_cwd(app: AppHandle, session_id: String) -> Result<Option<String>, AppError> {
    Ok(app
        .state::<AppState>()
        .terminal
        .session_cwd(&session_id)
        .map(|p| p.to_string_lossy().to_string()))
}
