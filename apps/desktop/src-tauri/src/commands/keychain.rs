use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::command;

const SERVICE_NAME: &str = "prisma-ai";

#[derive(Serialize, Deserialize)]
pub struct KeyResult {
  success: bool,
  key: Option<String>,
  error: Option<String>,
}

#[command]
pub async fn set_key(provider: String, key: String) -> Result<KeyResult, String> {
  let entry = Entry::new(SERVICE_NAME, &provider).map_err(|e| e.to_string())?;
  entry.set_password(&key).map_err(|e| e.to_string())?;
  Ok(KeyResult {
    success: true,
    key: None,
    error: None,
  })
}

#[command]
pub async fn get_key(provider: String) -> Result<KeyResult, String> {
  let entry = Entry::new(SERVICE_NAME, &provider).map_err(|e| e.to_string())?;
  match entry.get_password() {
    Ok(key) => Ok(KeyResult {
      success: true,
      key: Some(key),
      error: None,
    }),
    Err(keyring::Error::NoEntry) => {
      let env_var = format!("{}_API_KEY", provider.to_uppercase());
      if let Ok(val) = std::env::var(&env_var) {
        if !val.trim().is_empty() {
          return Ok(KeyResult {
            success: true,
            key: Some(val),
            error: None,
          });
        }
      }
      Ok(KeyResult {
        success: true,
        key: None,
        error: None,
      })
    }
    Err(e) => Ok(KeyResult {
      success: false,
      key: None,
      error: Some(e.to_string()),
    }),
  }
}

#[command]
pub async fn delete_key(provider: String) -> Result<KeyResult, String> {
  let entry = Entry::new(SERVICE_NAME, &provider).map_err(|e| e.to_string())?;
  entry.delete_credential().map_err(|e| e.to_string())?;
  Ok(KeyResult {
    success: true,
    key: None,
    error: None,
  })
}

#[command]
pub async fn list_keys() -> Result<Vec<String>, String> {
  // keyring doesn't support listing, so we return known providers
  let providers = vec![
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "xai",
    "nvidia",
    "openrouter",
    "omniroute",
    "groq",
    "together",
    "fireworks",
  ];
  Ok(providers.iter().map(|s| s.to_string()).collect())
}