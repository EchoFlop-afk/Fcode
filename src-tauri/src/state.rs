use crate::store::conversations::ConversationStore;
use crate::store::promotions::PromotionsStore;
use crate::store::settings::Settings;
use crate::store::usage::UsageStore;
use crate::tools::terminal::TerminalManager;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

/// Shared application state managed by Tauri.
pub struct AppState {
    pub data_dir: PathBuf,
    pub settings: RwLock<Settings>,
    pub usage: Mutex<UsageStore>,
    pub promotions: Mutex<PromotionsStore>,
    pub conversations: ConversationStore,
    pub terminal: TerminalManager,
    pub http: reqwest::Client,
    /// Active stream cancel flags, keyed by stream handle.
    pub streams: Mutex<std::collections::HashMap<u64, Arc<std::sync::atomic::AtomicBool>>>,
    stream_ids: AtomicU64,
}

impl AppState {
    pub fn init(data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        let settings_path = data_dir.join("settings.json");
        let settings: Settings = crate::store::read_json(&settings_path)
            .ok()
            .flatten()
            .unwrap_or_default();
        crate::store::write_json_atomic(&settings_path, &settings)
            .map_err(|e| e.to_string())?;

        let conversations = ConversationStore::new(data_dir.join("conversations"))
            .map_err(|e| e.to_string())?;
        let usage = crate::store::usage::load_or_default(data_dir.join("usage.json"));
        let promotions =
            crate::store::promotions::load_or_default(data_dir.join("promotions.json"));

        let http = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .read_timeout(std::time::Duration::from_secs(300))
            .user_agent("Fcode/0.1")
            .build()
            .map_err(|e| e.to_string())?;

        Ok(Self {
            data_dir,
            settings: RwLock::new(settings),
            usage: Mutex::new(usage),
            promotions: Mutex::new(promotions),
            conversations,
            terminal: TerminalManager::new(),
            http,
            streams: Mutex::new(std::collections::HashMap::new()),
            stream_ids: AtomicU64::new(1),
        })
    }

    /// Registers a new cancellable stream and returns its handle.
    pub fn register_stream(&self) -> (u64, Arc<std::sync::atomic::AtomicBool>) {
        let id = self.next_stream_id();
        let flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        self.streams.lock().unwrap().insert(id, flag.clone());
        (id, flag)
    }

    pub fn cancel_stream(&self, id: u64) {
        if let Some(flag) = self.streams.lock().unwrap().get(&id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    pub fn unregister_stream(&self, id: u64) {
        self.streams.lock().unwrap().remove(&id);
    }

    pub fn next_stream_id(&self) -> u64 {
        self.stream_ids.fetch_add(1, Ordering::SeqCst)
    }

    pub fn settings_path(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }

    pub fn usage_path(&self) -> PathBuf {
        self.data_dir.join("usage.json")
    }

    pub fn promotions_path(&self) -> PathBuf {
        self.data_dir.join("promotions.json")
    }

    pub fn save_settings(&self) -> Result<(), String> {
        let settings = self.settings.read().unwrap().clone();
        crate::store::write_json_atomic(&self.settings_path(), &settings).map_err(|e| e.to_string())
    }

    pub fn save_usage(&self) {
        let mut usage = self.usage.lock().unwrap();
        usage.prune(180);
        let _ = crate::store::usage::save(&self.usage_path(), &usage);
    }

    pub fn save_promotions(&self) {
        let promos = self.promotions.lock().unwrap().clone();
        let _ = crate::store::promotions::save(&self.promotions_path(), &promos);
    }
}
