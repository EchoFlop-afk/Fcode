use crate::models::{ProviderConfig, ProviderFlavor, ProviderKind};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GeneralSettings {
    pub auto_title: bool,
    pub send_on_enter: bool,
    pub default_agent_mode: bool,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            auto_title: true,
            send_on_enter: true,
            default_agent_mode: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub theme: String, // "dark" | "light"
    pub font_size: u16,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            font_size: 13,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ModelSettings {
    pub default_model: Option<String>,
    pub fallbacks: Vec<String>,
    pub fallback_enabled: bool,
    pub catalog_refreshed_at: Option<i64>,
}

impl Default for ModelSettings {
    fn default() -> Self {
        Self {
            default_model: None,
            fallbacks: vec![],
            fallback_enabled: false,
            catalog_refreshed_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AgentSettings {
    pub max_iterations: u32,
    pub context_budget_tokens: u32,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            max_iterations: 25,
            context_budget_tokens: 24000,
        }
    }
}

/// Permission mode per tool group: "ask" | "auto" | "disabled"
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PermissionsSettings {
    pub filesystem: String,
    pub terminal: String,
    pub git: String,
}

impl Default for PermissionsSettings {
    fn default() -> Self {
        Self {
            filesystem: "ask".into(),
            terminal: "ask".into(),
            git: "ask".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TerminalSettings {
    pub shell: String, // "powershell" | "cmd"
    pub timeout_secs: u64,
}

impl Default for TerminalSettings {
    fn default() -> Self {
        Self {
            shell: "powershell".into(),
            timeout_secs: 180,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AdvancedSettings {
    pub log_to_file: bool,
}

impl Default for AdvancedSettings {
    fn default() -> Self {
        Self { log_to_file: false }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub version: u32,
    pub general: GeneralSettings,
    pub appearance: AppearanceSettings,
    pub providers: Vec<ProviderConfig>,
    pub models: ModelSettings,
    pub agent: AgentSettings,
    pub permissions: PermissionsSettings,
    pub terminal: TerminalSettings,
    pub projects: ProjectsSettings,
    pub advanced: AdvancedSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProjectsSettings {
    pub active: Option<String>,
    pub recent: Vec<String>,
}

impl Default for ProjectsSettings {
    fn default() -> Self {
        Self {
            active: None,
            recent: vec![],
        }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            general: GeneralSettings::default(),
            appearance: AppearanceSettings::default(),
            providers: ProviderConfig::builtin_defaults(),
            models: ModelSettings::default(),
            agent: AgentSettings::default(),
            permissions: PermissionsSettings::default(),
            terminal: TerminalSettings::default(),
            projects: ProjectsSettings::default(),
            advanced: AdvancedSettings::default(),
        }
    }
}

impl Settings {
    pub fn provider(&self, id: &str) -> Option<&ProviderConfig> {
        self.providers.iter().find(|p| p.id == id)
    }

    pub fn add_custom_provider(
        &mut self,
        id: String,
        name: String,
        base_url: String,
    ) -> &ProviderConfig {
        let cfg = ProviderConfig {
            flavor: ProviderFlavor::Custom,
            kind: ProviderKind::OpenaiCompat,
            requires_key: true,
            is_local: base_url.contains("localhost") || base_url.contains("127.0.0.1"),
            supports_tools: true,
            enabled: true,
            id,
            name,
            base_url,
        };
        self.providers.push(cfg);
        self.providers.last().unwrap()
    }
}
