import * as SQLite from 'expo-sqlite';
import type { NormalizedMessage, ModelId, ProviderId } from '@prisma-ai/core/providers';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('prisma.db');
  }
  return dbInstance;
}

export interface Conversation {
  id: string;
  title: string | null;
  updatedAt: number;
  messageCount: number;
}

export interface SearchResult {
  conversationId: string;
  title: string | null;
  snippet: string;
  timestamp: number;
  messageId: string;
}

export interface ConversationFull {
  id: string;
  project_id: string | null;
  title: string | null;
  model_id: string;
  provider_id: string;
  system_prompt: string | null;
  parameters: string | null;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string | null;
  tool_calls: string | null;
  tool_call_id: string | null;
  attachments: string | null;
  model_id: string | null;
  token_count: number | null;
  cost: number | null;
  extra: string | null;
  created_at: number;
}

export function initializeDatabase(): void {
  const db = getDatabase();
  
  db.execSync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT,
      model_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      system_prompt TEXT,
      parameters TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      attachments TEXT,
      model_id TEXT,
      token_count INTEGER,
      cost REAL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instructions TEXT,
      settings TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mcp_connectors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL,
      config TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      project_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      content=messages,
      content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
      UPDATE messages_fts SET content = new.content WHERE rowid = new.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
    END;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entitlements (
      feature TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    INSERT OR IGNORE INTO entitlements (feature, enabled) VALUES 
      ('voice', 1),
      ('image_gen', 1),
      ('agents', 1),
      ('mcp', 1),
      ('skills', 1),
      ('plugins', 1),
      ('video_input', 1);

    INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (1, strftime('%s', 'now') * 1000);
  `);
}

export function getConversations(): Conversation[] {
  const db = getDatabase();
  
  const result = db.getAllSync<Conversation>(
    `SELECT c.id, c.title, c.updated_at as updatedAt, COUNT(m.id) as messageCount
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     GROUP BY c.id
     ORDER BY c.updated_at DESC`
  );
  
  return result.map(row => ({
    ...row,
    updatedAt: Number(row.updatedAt),
    messageCount: Number(row.messageCount),
  }));
}

export function getConversation(id: string): ConversationFull | undefined {
  const db = getDatabase();
  const result = db.getFirstSync<ConversationFull>(
    `SELECT * FROM conversations WHERE id = ?`,
    [id]
  );
  return result ?? undefined;
}

export function getNormalizedMessages(conversationId: string): NormalizedMessage[] {
  const db = getDatabase();
  
  const messages = db.getAllSync<MessageRow>(
    `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    [conversationId]
  );
  
  return messages.map((m) => ({
    role: m.role as NormalizedMessage['role'],
    content: m.content,
    toolCalls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
    toolCallId: m.tool_call_id || undefined,
    attachments: m.attachments ? JSON.parse(m.attachments) : undefined,
    modelId: m.model_id || undefined,
    tokenCount: m.token_count ?? undefined,
    cost: m.cost ?? undefined,
    createdAt: m.created_at,
    extra: m.extra ? JSON.parse(m.extra) : undefined,
  }));
}

export function createConversation(conversation: {
  id: string;
  projectId: string | null;
  title: string | null;
  modelId: string;
  providerId: string;
  systemPrompt: string | null;
  parameters: string | null;
  createdAt: number;
  updatedAt: number;
}): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO conversations (id, project_id, title, model_id, provider_id, system_prompt, parameters, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      conversation.id,
      conversation.projectId,
      conversation.title,
      conversation.modelId,
      conversation.providerId,
      conversation.systemPrompt,
      conversation.parameters,
      conversation.createdAt,
      conversation.updatedAt,
    ]
  );
}

export function updateConversation(
  id: string,
  updates: Partial<Pick<ConversationFull, 'title' | 'model_id' | 'provider_id' | 'system_prompt' | 'parameters'>>
): void {
  const db = getDatabase();
  
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  
  if (updates.title !== undefined) {
    fields.push('title = ?');
    params.push(updates.title);
  }
  if (updates.model_id !== undefined) {
    fields.push('model_id = ?');
    params.push(updates.model_id);
  }
  if (updates.provider_id !== undefined) {
    fields.push('provider_id = ?');
    params.push(updates.provider_id);
  }
  if (updates.system_prompt !== undefined) {
    fields.push('system_prompt = ?');
    params.push(updates.system_prompt);
  }
  if (updates.parameters !== undefined) {
    fields.push('parameters = ?');
    params.push(updates.parameters);
  }
  
  if (fields.length === 0) return;
  
  fields.push('updated_at = ?');
  const finalParams: (string | number | null)[] = [...params, Date.now(), id];
  db.runSync(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`, finalParams);
}

export function touchConversation(id: string): void {
  const db = getDatabase();
  db.runSync('UPDATE conversations SET updated_at = ? WHERE id = ?', [Date.now(), id]);
}

export function createMessage(message: {
  id: string;
  conversationId: string;
  role: string;
  content: string | null;
  toolCalls: string | null;
  toolCallId: string | null;
  attachments: string | null;
  modelId: string | null;
  tokenCount: number | null;
  cost: number | null;
  extra: string | null;
  createdAt: number;
}): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_call_id, attachments, model_id, token_count, cost, extra, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.conversationId,
      message.role,
      message.content,
      message.toolCalls,
      message.toolCallId,
      message.attachments,
      message.modelId,
      message.tokenCount,
      message.cost,
      message.extra,
      message.createdAt,
    ] as const
  );
}

export function deleteMessages(conversationId: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
}

export function searchMessages(query: string) {
  const db = getDatabase();
  
  const sanitized = query
    .replace(/"/g, '""')
    .replace(/[^\w\s-]/g, ' ')
    .trim();
  
  if (!sanitized) return [];
  
  return db.getAllSync<{ conversationId: string; title: string | null; snippet: string; timestamp: number; messageId: string }>(
    `SELECT m.conversation_id as conversationId, c.title, m.content as snippet, m.created_at as timestamp, m.id as messageId
     FROM messages_fts f
     JOIN messages m ON m.rowid = f.rowid
     JOIN conversations c ON c.id = m.conversation_id
     WHERE messages_fts MATCH ?
     ORDER BY rank
     LIMIT 50`,
    [query]
  ).map(row => ({
    ...row,
    timestamp: Number(row.timestamp),
    snippet: row.snippet ? row.snippet.slice(0, 100) : '',
  }));
}

export function deleteConversation(id: string): void {
  const db = getDatabase();
  db.runSync('DELETE FROM conversations WHERE id = ?', [id]);
}

export function exportConversation(id: string) {
  const db = getDatabase();
  
  const conv = db.getFirstSync<ConversationFull>(
    `SELECT id, title, model_id, provider_id, system_prompt, parameters, created_at, updated_at
     FROM conversations WHERE id = ?`,
    [id]
  );
  
  if (!conv) throw new Error('Conversation not found');
  
  const messages = db.getAllSync<MessageRow>(
    `SELECT id, role, content, tool_calls, tool_call_id, attachments, model_id, token_count, cost, extra, created_at
     FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    [id]
  );
  
  const parsedMessages = messages.map(row => ({
    role: row.role,
    content: row.content,
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
    toolCallId: row.tool_call_id,
    attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
    modelId: row.model_id,
    tokenCount: row.token_count,
    cost: row.cost,
    extra: row.extra ? JSON.parse(row.extra) : undefined,
    createdAt: row.created_at,
  }));
  
  return {
    id: conv.id,
    title: conv.title,
    model_id: conv.model_id,
    provider_id: conv.provider_id,
    system_prompt: conv.system_prompt,
    parameters: conv.parameters ? JSON.parse(conv.parameters) : {},
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    messages: parsedMessages,
  };
}
