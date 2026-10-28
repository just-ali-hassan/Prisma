-- Migration 1: Initial Schema
-- Core tables for Prisma AI Client

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version         INTEGER PRIMARY KEY,
    applied_at      INTEGER NOT NULL
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
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
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
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
);

-- Index for faster conversation message queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    instructions    TEXT,
    settings        TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- Project files
CREATE TABLE IF NOT EXISTS project_files (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    filename        TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    path            TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- MCP connector configs
CREATE TABLE IF NOT EXISTS mcp_connectors (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    transport       TEXT NOT NULL,
    config          TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    project_id      TEXT,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- FTS5 virtual table for search
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,
    content=messages,
    content_rowid=rowid
);

-- Triggers to keep FTS5 in sync
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
    UPDATE messages_fts SET content = new.content WHERE rowid = new.rowid;
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
    DELETE FROM messages_fts WHERE rowid = old.rowid;
END;

-- Settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);

-- Entitlements
CREATE TABLE IF NOT EXISTS entitlements (
    feature         TEXT PRIMARY KEY,
    enabled         INTEGER NOT NULL DEFAULT 1
);

-- Initialize default entitlements
INSERT OR IGNORE INTO entitlements (feature, enabled) VALUES 
    ('voice', 1),
    ('image_gen', 1),
    ('agents', 1),
    ('mcp', 1),
    ('skills', 1),
    ('plugins', 1),
    ('video_input', 1);

-- Record initial schema version
INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (1, strftime('%s', 'now') * 1000);