use crate::error::AppError;
use crate::models::Message;
use crate::state::AppState;
use crate::store::conversations::{auto_title, Conversation};
use crate::store::settings::Settings;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn settings_get(app: AppHandle) -> Settings {
    app.state::<AppState>().settings.read().unwrap().clone()
}

/// Replaces the persisted settings (frontend sends the full object after
/// merging its change; secrets never live in settings).
#[tauri::command]
pub fn settings_save(app: AppHandle, settings: Settings) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    *state.settings.write().unwrap() = settings;
    state.save_settings().map_err(AppError::internal)
}

#[tauri::command]
pub fn conversation_create(app: AppHandle, conversation: Conversation) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    state.conversations.save(&conversation)?;
    Ok(())
}

#[tauri::command]
pub fn conversation_save(app: AppHandle, conversation: Conversation) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    state.conversations.save(&conversation)?;
    Ok(())
}

#[tauri::command]
pub fn conversation_list(app: AppHandle) -> Vec<crate::store::conversations::ConversationMeta> {
    app.state::<AppState>().conversations.load_index()
}

#[tauri::command]
pub fn conversation_get(app: AppHandle, id: String) -> Result<Option<Conversation>, AppError> {
    app.state::<AppState>().conversations.load(&id)
}

#[tauri::command]
pub fn conversation_delete(app: AppHandle, id: String) -> Result<(), AppError> {
    app.state::<AppState>().conversations.delete(&id)
}

#[tauri::command]
pub fn conversation_rename(app: AppHandle, id: String, title: String) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let mut conv = state
        .conversations
        .load(&id)?
        .ok_or_else(|| AppError::bad_request("Conversation not found"))?;
    conv.meta.title = title;
    state.conversations.save(&conv)?;
    Ok(())
}

#[tauri::command]
pub fn conversation_pin(app: AppHandle, id: String, pinned: bool) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let mut conv = state
        .conversations
        .load(&id)?
        .ok_or_else(|| AppError::bad_request("Conversation not found"))?;
    conv.meta.pinned = pinned;
    state.conversations.save(&conv)?;
    Ok(())
}

#[tauri::command]
pub fn conversation_search(
    app: AppHandle,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<crate::store::conversations::ConversationMeta>, AppError> {
    app.state::<AppState>()
        .conversations
        .search(&query, limit.unwrap_or(20) as usize)
}

/// Derives an automatic conversation title from the first user message.
#[tauri::command]
pub fn auto_title_cmd(text: String) -> String {
    auto_title(&text)
}

/// Appends messages to a conversation without loading it into the frontend
/// (used for crash-safe persistence during long agent turns).
#[tauri::command]
pub fn conversation_append_messages(
    app: AppHandle,
    id: String,
    messages: Vec<Message>,
    model: Option<String>,
    provider: Option<String>,
) -> Result<(), AppError> {
    let state = app.state::<AppState>();
    let mut conv = state
        .conversations
        .load(&id)?
        .ok_or_else(|| AppError::bad_request("Conversation not found"))?;
    for m in messages {
        conv.messages.push(m);
    }
    if let Some(t) = model {
        conv.meta.model = Some(t);
    }
    if let Some(p) = provider {
        conv.meta.provider = Some(p);
    }
    if conv.meta.title.is_empty() || conv.meta.title == "New Chat" {
        if let Some(first_user) = conv.messages.iter().find(|m| m.role == crate::models::Role::User) {
            conv.meta.title = auto_title(&first_user.content);
        }
    }
    state.conversations.save(&conv)?;
    Ok(())
}
