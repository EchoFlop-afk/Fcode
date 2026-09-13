use crate::error::{AppError, AppResult};

const SERVICE: &str = "Fcode";

fn entry_for(provider_id: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, &format!("provider/{provider_id}"))
        .map_err(|e| AppError::storage(format!("Credential store unavailable: {e}")))
}

/// Stores a provider API key in the Windows Credential Manager.
pub fn set_key(provider_id: &str, key: &str) -> AppResult<()> {
    let entry = entry_for(provider_id)?;
    entry
        .set_password(key)
        .map_err(|e| AppError::storage(format!("Failed to store credential: {e}")))
}

/// Reads a provider API key. Returns Ok(None) when no key is stored.
pub fn get_key(provider_id: &str) -> AppResult<Option<String>> {
    let entry = entry_for(provider_id)?;
    match entry.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::storage(format!("Failed to read credential: {e}"))),
    }
}

pub fn delete_key(provider_id: &str) -> AppResult<()> {
    let entry = entry_for(provider_id)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::storage(format!("Failed to delete credential: {e}"))),
    }
}

/// Redacted display form: shows only the trailing 4 characters.
pub fn mask_key(key: &str) -> String {
    let n = key.chars().count();
    if n <= 4 {
        "••••".to_string()
    } else {
        format!("••••{}", &key[n - 4..])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_keys() {
        assert_eq!(mask_key("sk-1234567890"), "••••7890");
        assert_eq!(mask_key("abc"), "••••");
    }
}
