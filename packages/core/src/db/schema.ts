/**
 * SQLite Schema
 *
 * Core tables for conversations, messages, projects, settings, and entitlements.
 * Migrations are applied on app startup using a simple version counter.
 */

export const SCHEMA_VERSION = 1;

/**
 * SQL statements to create all tables.
 * Run in order on first startup or migration.
 */
export const CREATE_TABLES = [
  // Conversations
  `CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    project_id      TEXT,
    title           TEXT,
    model_id        TEXT NOT NULL,
    provider_id     TEXT NOT NULL,
    system_prompt   TEXT,
    parameters      TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
  );`,

  // Messages
  `CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role            TEXT NOT NULL,
    content         TEXT,
    tool_calls      TEXT,
    tool_call_id    TEXT,
    attachments     TEXT,
    model_id        TEXT,
    token_count     INTEGER,
    cost            REAL,
    extra           TEXT,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );`,

  // Index for faster conversation message queries
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);`,
  `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);`,

  // Projects (M4)
  `CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    instructions    TEXT,
    settings        TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );`,

  // Project files (M4)
  `CREATE TABLE IF NOT EXISTS project_files (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    filename        TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    path            TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );`,

  // MCP connector configs (M8)
  `CREATE TABLE IF NOT EXISTS mcp_connectors (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    transport       TEXT NOT NULL,
    config          TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    project_id      TEXT,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );`,

  // FTS5 virtual table for search (M2)
  `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    content=messages,
    content_rowid=rowid
  );`,

  // Triggers to keep FTS5 in sync
  `CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
  END;`,

  `CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
    UPDATE messages_fts SET content = new.content WHERE rowid = new.rowid;
  END;`,

  `CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
    DELETE FROM messages_fts WHERE rowid = old.rowid;
  END;`,

  // Settings (key-value, M2)
  `CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
  );`,

  // Entitlements (M2)
  `CREATE TABLE IF NOT EXISTS entitlements (
    feature         TEXT PRIMARY KEY,
    enabled         INTEGER NOT NULL DEFAULT 1
  );`,

  // Schema version tracking
  `CREATE TABLE IF NOT EXISTS schema_version (
    version         INTEGER PRIMARY KEY,
    applied_at      INTEGER NOT NULL
  );`,
];

/**
 * Migration statements for each version.
 * Add new migrations here as schema evolves.
 */
export const MIGRATIONS: Record<number, string[]> = {
  // Version 1 is the initial schema (CREATE_TABLES above)
  // Future versions would go here:
  // 2: ['ALTER TABLE conversations ADD COLUMN new_column TEXT;'],
};

/**
 * Default entitlements - all enabled at launch.
 * When monetization arrives, flip flags here.
 */
export const DEFAULT_ENTITLEMENTS = [
  'voice',
  'image_gen',
  'agents',
  'mcp',
  'skills',
  'plugins',
  'video_input',
];

/**
 * Initialize database with schema and run migrations.
 */
export async function initializeDatabase(db: Database): Promise<void> {
  // Create tables
  for (const sql of CREATE_TABLES) {
    await db.exec(sql);
  }

  // Check current schema version
  const versionRow = await db.get<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  );
  const currentVersion = versionRow?.version ?? 0;

  // Run migrations
  for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
    const migration = MIGRATIONS[v];
    if (migration) {
      for (const sql of migration) {
        await db.exec(sql);
      }
    }
    // Record migration
    await db.run('INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)', [
      v,
      Date.now(),
    ]);
  }

  // Initialize default entitlements
  for (const feature of DEFAULT_ENTITLEMENTS) {
    await db.run('INSERT OR IGNORE INTO entitlements (feature, enabled) VALUES (?, 1)', [feature]);
  }
}

/**
 * Database interface - implemented by platform-specific drivers.
 * Mobile uses expo-sqlite, Desktop uses better-sqlite3.
 */
export interface Database {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number; changes: number }>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

/**
 * Transaction helper.
 */
export async function transaction<T>(db: Database, fn: (tx: Database) => Promise<T>): Promise<T> {
  await db.exec('BEGIN TRANSACTION');
  try {
    const result = await fn(db);
    await db.exec('COMMIT');
    return result;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
