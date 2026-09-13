use crate::error::AppResult;
use crate::models::Message;
use crate::store::{read_json, write_json_atomic};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ConversationMeta {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub message_count: u32,
    #[serde(default)]
    pub preview: String,
}

impl Default for ConversationMeta {
    fn default() -> Self {
        Self {
            id: String::new(),
            title: "New Chat".into(),
            created_at: 0,
            updated_at: 0,
            model: None,
            provider: None,
            pinned: false,
            message_count: 0,
            preview: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Conversation {
    pub meta: ConversationMeta,
    pub messages: Vec<Message>,
}

impl Default for Conversation {
    fn default() -> Self {
        Self {
            meta: ConversationMeta::default(),
            messages: vec![],
        }
    }
}

/// File-backed conversation store: one JSON file per conversation plus a
/// lightweight index so listing does not load message contents.
pub struct ConversationStore {
    dir: PathBuf,
    write_lock: std::sync::Mutex<()>,
}

impl ConversationStore {
    pub fn new(dir: PathBuf) -> AppResult<Self> {
        fs::create_dir_all(&dir)?;
        Ok(Self {
            dir,
            write_lock: std::sync::Mutex::new(()),
        })
    }

    fn conv_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.json"))
    }

    fn index_path(&self) -> PathBuf {
        self.dir.join("index.json")
    }

    pub fn load_index(&self) -> Vec<ConversationMeta> {
        let index: Vec<ConversationMeta> =
            read_json(&self.index_path()).ok().flatten().unwrap_or_default();
        let mut index = index;
        // Reconcile with files on disk (handles manual deletion/import).
        let mut seen = std::collections::HashSet::new();
        index.retain(|m| {
            let exists = self.conv_path(&m.id).exists();
            if exists {
                seen.insert(m.id.clone());
            }
            exists
        });
        if let Ok(entries) = fs::read_dir(&self.dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json")
                    && path.file_stem().is_some()
                {
                    let stem = path.file_stem().unwrap().to_string_lossy().to_string();
                    if stem == "index" || seen.contains(&stem) {
                        continue;
                    }
                    if let Ok(Some(conv)) = self.load(&stem) {
                        index.push(Self::meta_from(&conv));
                    }
                }
            }
        }
        index.sort_by(|a, b| {
            b.pinned
                .cmp(&a.pinned)
                .then(b.updated_at.cmp(&a.updated_at))
        });
        index
    }

    fn save_index(&self, index: &[ConversationMeta]) -> AppResult<()> {
        write_json_atomic(&self.index_path(), &index)
    }

    fn meta_from(conv: &Conversation) -> ConversationMeta {
        let preview = conv
            .messages
            .iter()
            .rev()
            .find(|m| !m.content.is_empty())
            .map(|m| m.content.chars().take(120).collect())
            .unwrap_or_default();
        ConversationMeta {
            id: conv.meta.id.clone(),
            title: conv.meta.title.clone(),
            created_at: conv.meta.created_at,
            updated_at: conv.meta.updated_at,
            model: conv.meta.model.clone(),
            provider: conv.meta.provider.clone(),
            pinned: conv.meta.pinned,
            message_count: conv.messages.len() as u32,
            preview,
        }
    }

    pub fn load(&self, id: &str) -> AppResult<Option<Conversation>> {
        read_json(&self.conv_path(id))
    }

    pub fn save(&self, conv: &Conversation) -> AppResult<ConversationMeta> {
        let _guard = self.write_lock.lock().unwrap();
        let meta = Self::meta_from(conv);
        write_json_atomic(&self.conv_path(&conv.meta.id), conv)?;
        let mut index = self.load_index();
        index.retain(|m| m.id != meta.id);
        index.push(meta.clone());
        index.sort_by(|a, b| {
            b.pinned
                .cmp(&a.pinned)
                .then(b.updated_at.cmp(&a.updated_at))
        });
        self.save_index(&index)?;
        Ok(meta)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        let _guard = self.write_lock.lock().unwrap();
        let path = self.conv_path(id);
        if path.exists() {
            fs::remove_file(path)?;
        }
        let mut index = self.load_index();
        index.retain(|m| m.id != id);
        self.save_index(&index)?;
        Ok(())
    }

    /// Search across conversation titles and message content.
    /// Scans are capped to keep this lightweight.
    pub fn search(&self, query: &str, limit: usize) -> AppResult<Vec<ConversationMeta>> {
        let q = query.to_lowercase();
        if q.is_empty() {
            return Ok(vec![]);
        }
        let mut results: Vec<(ConversationMeta, u32)> = Vec::new();
        for meta in self.load_index() {
            if results.len() >= limit {
                break;
            }
            let mut score: u32 = if meta.title.to_lowercase().contains(&q) { 2 } else { 0 };
            if score > 0 {
                results.push((meta, score));
                continue;
            }
            if let Ok(Some(conv)) = self.load(&meta.id) {
                for msg in conv.messages.iter().take(200) {
                    if msg.content.to_lowercase().contains(&q) {
                        score = 1;
                        break;
                    }
                }
            }
            if score > 0 {
                results.push((meta, score));
            }
        }
        results.sort_by(|a, b| b.1.cmp(&a.1).then(b.0.updated_at.cmp(&a.0.updated_at)));
        Ok(results.into_iter().map(|(m, _)| m).take(limit).collect())
    }
}

pub fn auto_title(first_user_message: &str) -> String {
    let cleaned: String = first_user_message
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    let title: String = cleaned.chars().take(60).collect();
    if title.is_empty() {
        "New Chat".to_string()
    } else {
        title
    }
}

