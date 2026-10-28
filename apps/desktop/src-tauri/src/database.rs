use serde::Serialize;
use sqlx::{Column, Row, TypeInfo, ValueRef};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:prisma.db";

/// Database state (maintained for backwards compatibility)
pub struct DatabaseState {
    pub pool: sqlx::SqlitePool,
}

/// Define migrations for SQLite
pub fn get_migrations() -> Vec<Migration> {
    vec![
        // Migration 1: Initial schema
        Migration {
            version: 1,
            description: "Create initial schema",
            sql: include_str!("../migrations/001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// Helper to acquire the SQLite pool from Tauri's managed DbInstances
pub async fn get_db_pool(app: &AppHandle) -> Result<sqlx::SqlitePool, String> {
    let instances = app.state::<DbInstances>();
    let instances_read = instances.0.read().await;
    match instances_read.get(DB_URL) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        #[allow(unreachable_patterns)]
        _ => Err(format!("Database '{}' is not initialized or not a SQLite pool", DB_URL)),
    }
}

/// Internal database initialization function
pub async fn initialize_database_internal(app: &AppHandle) -> Result<(), String> {
    let _pool = get_db_pool(app).await?;
    println!("Database initialized successfully");
    Ok(())
}

/// Initialize database (called from Rust setup or frontend)
#[tauri::command]
pub async fn initialize_database(app: AppHandle) -> Result<(), String> {
    initialize_database_internal(&app).await
}

/// Run pending migrations
#[tauri::command]
pub async fn run_migrations(app: AppHandle) -> Result<(), String> {
    // Migrations are automatically applied by tauri-plugin-sql on database preload.
    let _pool = get_db_pool(&app).await?;
    Ok(())
}

/// Generic SQL execution commands for core Database interface


/// Execute SQL (for DDL statements)
#[tauri::command]
pub async fn exec_sql(app: AppHandle, sql: String) -> Result<(), String> {
    let pool = get_db_pool(&app).await?;
    sqlx::raw_sql(&sql)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}


#[derive(Serialize)]
pub struct RunSqlResult {
    #[serde(rename = "lastInsertRowid")]
    pub last_insert_rowid: i64,
    pub changes: i64,
}

fn bind_json_params<'q>(
    mut query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    params: &'q [serde_json::Value],
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    for param in params {
        match param {
            serde_json::Value::Null => {
                query = query.bind(None::<String>);
            }
            serde_json::Value::Bool(b) => {
                query = query.bind(*b);
            }
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query = query.bind(i);
                } else if let Some(f) = n.as_f64() {
                    query = query.bind(f);
                } else {
                    query = query.bind(n.to_string());
                }
            }
            serde_json::Value::String(s) => {
                query = query.bind(s.as_str());
            }
            serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
                query = query.bind(param.to_string());
            }
        }
    }
    query
}

fn sqlite_row_to_json(row: &sqlx::sqlite::SqliteRow) -> Result<serde_json::Value, String> {
    let mut obj = serde_json::Map::new();
    for (i, col) in row.columns().iter().enumerate() {
        let name = col.name();
        let val_ref = row.try_get_raw(i).map_err(|e| e.to_string())?;
        if val_ref.is_null() {
            obj.insert(name.to_string(), serde_json::Value::Null);
            continue;
        }
        let type_info = val_ref.type_info();
        let type_name = type_info.name();
        let json_val = match type_name {
            "TEXT" => {
                let s: String = row.try_get(i).unwrap_or_default();
                serde_json::Value::String(s)
            }
            "INTEGER" | "NUMERIC" => {
                let n: i64 = row.try_get(i).unwrap_or_default();
                serde_json::Value::Number(n.into())
            }
            "REAL" => {
                let f: f64 = row.try_get(i).unwrap_or_default();
                serde_json::Number::from_f64(f)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null)
            }
            "BOOLEAN" => {
                let b: bool = row.try_get(i).unwrap_or_default();
                serde_json::Value::Bool(b)
            }
            "BLOB" => {
                let b: Vec<u8> = row.try_get(i).unwrap_or_default();
                serde_json::Value::Array(b.into_iter().map(|byte| serde_json::Value::Number(byte.into())).collect())
            }
            _ => {
                if let Ok(s) = row.try_get::<String, _>(i) {
                    serde_json::Value::String(s)
                } else if let Ok(n) = row.try_get::<i64, _>(i) {
                    serde_json::Value::Number(n.into())
                } else if let Ok(f) = row.try_get::<f64, _>(i) {
                    serde_json::Number::from_f64(f)
                        .map(serde_json::Value::Number)
                        .unwrap_or(serde_json::Value::Null)
                } else {
                    serde_json::Value::Null
                }
            }
        };
        obj.insert(name.to_string(), json_val);
    }
    Ok(serde_json::Value::Object(obj))
}

/// Execute SQL with parameters (for DML statements)
#[tauri::command]
pub async fn run_sql(app: AppHandle, sql: String, params: Vec<serde_json::Value>) -> Result<RunSqlResult, String> {
    let pool = get_db_pool(&app).await?;
    let query = bind_json_params(sqlx::query(&sql), &params);
    let result = query.execute(&pool).await.map_err(|e| e.to_string())?;
    
    Ok(RunSqlResult {
        last_insert_rowid: result.last_insert_rowid(),
        changes: result.rows_affected() as i64,
    })
}


/// Execute SELECT SQL
#[tauri::command]
pub async fn select_sql(app: AppHandle, sql: String, params: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>, String> {
    let pool = get_db_pool(&app).await?;
    let query = bind_json_params(sqlx::query(&sql), &params);
    let rows = query.fetch_all(&pool).await.map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for row in &rows {
        results.push(sqlite_row_to_json(row)?);
    }
    
    Ok(results)
}

/// Conversation data for frontend
#[derive(Serialize, Debug)]
pub struct Conversation {
    pub id: String,
    pub title: Option<String>,
    pub updated_at: i64,
    pub message_count: i64,
}

/// Search result
#[derive(Serialize, Debug)]
pub struct SearchResult {
    pub conversation_id: String,
    pub title: Option<String>,
    pub snippet: String,
    pub timestamp: i64,
    pub message_id: String,
}

/// Get all conversations
#[tauri::command]
pub async fn get_conversations(app: AppHandle) -> Result<Vec<Conversation>, String> {
    let pool = get_db_pool(&app).await?;
    
    let rows = sqlx::query(
        r#"
        SELECT c.id, c.title, c.updated_at, COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        "#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to get conversations: {}", e))?;

    let conversations = rows
        .into_iter()
        .map(|row| Conversation {
            id: row.try_get::<String, _>("id").unwrap_or_default(),
            title: row.try_get::<Option<String>, _>("title").unwrap_or(None),
            updated_at: row.try_get::<i64, _>("updated_at").unwrap_or(0),
            message_count: row.try_get::<i64, _>("message_count").unwrap_or(0),
        })
        .collect();

    Ok(conversations)
}

/// Search messages using FTS5
#[tauri::command]
pub async fn search_messages(app: AppHandle, query: String) -> Result<Vec<SearchResult>, String> {
    let pool = get_db_pool(&app).await?;
    
    // Sanitize query for FTS5
    let sanitized = query
        .replace('"', "\"\"")
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', " ")
        .trim()
        .to_string();

    if sanitized.is_empty() {
        return Ok(vec![]);
    }

    let rows = sqlx::query(
        r#"
        SELECT m.conversation_id, c.title, m.content, m.created_at, m.id
        FROM messages_fts f
        JOIN messages m ON m.rowid = f.rowid
        JOIN conversations c ON c.id = m.conversation_id
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT 50
        "#,
    )
    .bind(sanitized)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Search failed: {}", e))?;

    let results = rows
        .into_iter()
        .map(|row| SearchResult {
            conversation_id: row.try_get::<String, _>("conversation_id").unwrap_or_default(),
            title: row.try_get::<Option<String>, _>("title").unwrap_or(None),
            snippet: row.try_get::<String, _>("content").unwrap_or_default(),
            timestamp: row.try_get::<i64, _>("created_at").unwrap_or(0),
            message_id: row.try_get::<String, _>("id").unwrap_or_default(),
        })
        .collect();

    Ok(results)
}

/// Delete a conversation
#[tauri::command]
pub async fn delete_conversation(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_db_pool(&app).await?;
    
    sqlx::query("DELETE FROM conversations WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete conversation: {}", e))?;

    Ok(())
}

/// Export conversation data
#[derive(Serialize, Debug)]
pub struct ExportMessage {
    pub role: String,
    pub content: Option<String>,
    pub tool_calls: Option<serde_json::Value>,
    pub tool_call_id: Option<String>,
    pub attachments: Option<serde_json::Value>,
    pub model_id: Option<String>,
    pub token_count: Option<i64>,
    pub cost: Option<f64>,
    pub extra: Option<serde_json::Value>,
    pub created_at: i64,
}

#[derive(Serialize, Debug)]
pub struct ExportConversation {
    pub id: String,
    pub title: Option<String>,
    pub model_id: String,
    pub provider_id: String,
    pub system_prompt: Option<String>,
    pub parameters: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
    pub messages: Vec<ExportMessage>,
}

/// Export a conversation by ID
#[tauri::command]
pub async fn export_conversation(app: AppHandle, id: String) -> Result<ExportConversation, String> {
    let pool = get_db_pool(&app).await?;
    
    // Get conversation
    let conv_row = sqlx::query(
        r#"
        SELECT id, title, model_id, provider_id, system_prompt, parameters, created_at, updated_at
        FROM conversations WHERE id = ?
        "#,
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to get conversation: {}", e))?
    .ok_or_else(|| "Conversation not found".to_string())?;

    // Get messages
    let msg_rows = sqlx::query(
        r#"
        SELECT role, content, tool_calls, tool_call_id, attachments, model_id, token_count, cost, extra, created_at
        FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
        "#,
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to get messages: {}", e))?;

    let messages = msg_rows
        .into_iter()
        .map(|row| {
            let tool_calls_str: Option<String> = row.try_get("tool_calls").ok();
            let attachments_str: Option<String> = row.try_get("attachments").ok();
            let extra_str: Option<String> = row.try_get("extra").ok();
            
            ExportMessage {
                role: row.try_get::<String, _>("role").unwrap_or_default(),
                content: row.try_get::<Option<String>, _>("content").unwrap_or(None),
                tool_calls: tool_calls_str.and_then(|s| serde_json::from_str(&s).ok()),
                tool_call_id: row.try_get::<Option<String>, _>("tool_call_id").unwrap_or(None),
                attachments: attachments_str.and_then(|s| serde_json::from_str(&s).ok()),
                model_id: row.try_get::<Option<String>, _>("model_id").unwrap_or(None),
                token_count: row.try_get::<Option<i64>, _>("token_count").unwrap_or(None),
                cost: row.try_get::<Option<f64>, _>("cost").unwrap_or(None),
                extra: extra_str.and_then(|s| serde_json::from_str(&s).ok()),
                created_at: row.try_get::<i64, _>("created_at").unwrap_or(0),
            }
        })
        .collect();

    let params_str: Option<String> = conv_row.try_get("parameters").ok();
    let parameters = params_str
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}));

    let export = ExportConversation {
        id: conv_row.try_get::<String, _>("id").unwrap_or_default(),
        title: conv_row.try_get::<Option<String>, _>("title").unwrap_or(None),
        model_id: conv_row.try_get::<String, _>("model_id").unwrap_or_default(),
        provider_id: conv_row.try_get::<String, _>("provider_id").unwrap_or_default(),
        system_prompt: conv_row.try_get::<Option<String>, _>("system_prompt").unwrap_or(None),
        parameters,
        created_at: conv_row.try_get::<i64, _>("created_at").unwrap_or(0),
        updated_at: conv_row.try_get::<i64, _>("updated_at").unwrap_or(0),
        messages,
    };

    Ok(export)
}