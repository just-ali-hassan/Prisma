pub mod commands;
pub mod database;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:prisma.db", database::get_migrations())
        .build(),
    )
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .manage(commands::mcp::McpState(
      std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
    ))
    .invoke_handler(tauri::generate_handler![
      commands::keychain::set_key,
      commands::keychain::get_key,
      commands::keychain::delete_key,
      commands::keychain::list_keys,
      commands::mcp::spawn_stdio_server,
      commands::mcp::kill_stdio_server,
      commands::files::read_file,
      commands::files::write_file,
      commands::files::pick_file,
      commands::database::initialize_database,
      commands::database::run_migrations,
      commands::database::get_conversations,
      commands::database::search_messages,
      commands::database::delete_conversation,
      commands::database::export_conversation,
      commands::database::exec_sql,
      commands::database::run_sql,
      commands::database::select_sql,
    ])
    .setup(|app| {
      // Initialize database on startup
      let app_handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        if let Err(e) = database::initialize_database_internal(&app_handle).await {
          eprintln!("Failed to initialize database: {}", e);
        }
      });

      #[cfg(debug_assertions)]
      {
        let window = app.get_webview_window("main").unwrap();
        window.open_devtools();
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}