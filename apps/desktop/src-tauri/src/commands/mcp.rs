use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{command, State};
use tokio::process::Command as TokioCommand;

// Global state for MCP server processes
type McpProcesses = Arc<Mutex<HashMap<String, tokio::process::Child>>>;

#[derive(Deserialize)]
pub struct StdioServerConfig {
  id: String,
  command: String,
  args: Vec<String>,
  env: Option<HashMap<String, String>>,
}

#[derive(Serialize)]
pub struct McpResult {
  success: bool,
  error: Option<String>,
}

pub struct McpState(pub McpProcesses);

#[command]
pub async fn spawn_stdio_server(
  config: StdioServerConfig,
  state: State<'_, McpState>,
) -> Result<McpResult, String> {
  let child = TokioCommand::new(&config.command)
    .args(&config.args)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .envs(config.env.unwrap_or_default())
    .spawn()
    .map_err(|e| format!("Failed to spawn MCP server: {}", e))?;

  // Store the process
  let mut processes = state.0.lock().unwrap();
  processes.insert(config.id.clone(), child);

  Ok(McpResult {
    success: true,
    error: None,
  })
}

#[command]
pub async fn kill_stdio_server(
    id: String,
    state: State<'_, McpState>,
) -> Result<McpResult, String> {
    let child = {
        let mut processes = state.0.lock().unwrap();
        processes.remove(&id)
    };

    if let Some(mut child) = child {
        child
            .kill()
            .await
            .map_err(|e| format!("Failed to kill MCP server: {e}"))?;
    }

    Ok(McpResult {
        success: true,
        error: None,
    })
}