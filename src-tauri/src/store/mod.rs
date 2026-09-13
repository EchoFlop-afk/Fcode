pub mod conversations;
pub mod promotions;
pub mod settings;
pub mod usage;

use crate::error::{AppError, AppResult};
use std::fs;
use std::io::Write;
use std::path::Path;

/// Writes JSON atomically: temp file + rename, so a crash never truncates data.
pub fn write_json_atomic<T: serde::Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    {
        let file = fs::File::create(&tmp)?;
        let mut writer = std::io::BufWriter::new(file);
        serde_json::to_writer(&mut writer, value)?;
        writer.flush()?;
    }
    // Windows rename-over-existing needs the target gone first.
    if path.exists() {
        let backup = path.with_extension("bak");
        let _ = fs::rename(path, &backup);
    }
    fs::rename(&tmp, path)
        .map_err(|e| AppError::storage(format!("Failed to write {}: {e}", path.display())))?;
    Ok(())
}

pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> AppResult<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(path)?;
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|e| AppError::storage(format!("Corrupt data in {}: {e}", path.display())))
}
