use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{command, Runtime};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct FileResult {
  success: bool,
  content: Option<String>,
  path: Option<String>,
  error: Option<String>,
}

#[derive(Deserialize)]
pub struct WriteFileRequest {
  path: String,
  content: String,
}

#[command]
pub async fn read_file(path: String) -> Result<FileResult, String> {
  let path = PathBuf::from(path);
  match tokio::fs::read_to_string(&path).await {
    Ok(content) => Ok(FileResult {
      success: true,
      content: Some(content),
      path: Some(path.to_string_lossy().to_string()),
      error: None,
    }),
    Err(e) => Ok(FileResult {
      success: false,
      content: None,
      path: None,
      error: Some(e.to_string()),
    }),
  }
}

#[command]
pub async fn write_file(request: WriteFileRequest) -> Result<FileResult, String> {
  let path = PathBuf::from(&request.path);
  if let Some(parent) = path.parent() {
    tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
  }
  match tokio::fs::write(&path, &request.content).await {
    Ok(_) => Ok(FileResult {
      success: true,
      content: None,
      path: Some(path.to_string_lossy().to_string()),
      error: None,
    }),
    Err(e) => Ok(FileResult {
      success: false,
      content: None,
      path: None,
      error: Some(e.to_string()),
    }),
  }
}

#[command]
pub async fn pick_file<R: Runtime>(app: tauri::AppHandle<R>) -> Result<FileResult, String> {
  let file_path = app
    .dialog()
    .file()
    .add_filter("All Files", &["*"])
    .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp"])
    .add_filter("Documents", &["pdf", "txt", "md", "json"])
    .blocking_pick_file();

  match file_path {
    Some(path) => {
      let path_buf = path.as_path().unwrap();
      Ok(FileResult {
        success: true,
        content: None,
        path: Some(path_buf.to_string_lossy().to_string()),
        error: None,
      })
    }
    None => Ok(FileResult {
      success: false,
      content: None,
      path: None,
      error: Some("No file selected".to_string()),
    }),
  }
}