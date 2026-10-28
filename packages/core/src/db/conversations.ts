/**
 * Conversations CRUD
 *
 * Database operations for conversations and messages.
 * All queries centralized here.
 */

import type { Database } from './schema';
import type { NormalizedMessage } from '../providers/types';

export interface Conversation {
  id: string;
  projectId: string | null;
  title: string | null;
  modelId: string;
  providerId: string;
  systemPrompt: string | null;
  parameters: string | null; // JSON
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string | null;
  toolCalls: string | null; // JSON
  toolCallId: string | null;
  attachments: string | null; // JSON
  modelId: string | null;
  tokenCount: number | null;
  cost: number | null;
  extra: string | null; // JSON
  createdAt: number;
}

/**
 * Create a new conversation.
 */
export async function createConversation(
  db: Database,
  conversation: Omit<Conversation, 'createdAt' | 'updatedAt'> & {
    createdAt?: number;
    updatedAt?: number;
  }
): Promise<void> {
  const now = Date.now();
  await db.run(
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
      conversation.createdAt ?? now,
      conversation.updatedAt ?? now,
    ]
  );
}

/**
 * Get a conversation by ID.
 */
export async function getConversation(db: Database, id: string): Promise<Conversation | undefined> {
  return db.get<Conversation>(
    `SELECT id, project_id AS projectId, title, model_id AS modelId, provider_id AS providerId,
            system_prompt AS systemPrompt, parameters, created_at AS createdAt, updated_at AS updatedAt
     FROM conversations WHERE id = ?`,
    [id]
  );
}

/**
 * Get all conversations, optionally filtered by project.
 */
export async function getConversations(
  db: Database,
  projectId?: string | null
): Promise<Conversation[]> {
  if (projectId) {
    return db.all<Conversation>(
      `SELECT id, project_id AS projectId, title, model_id AS modelId, provider_id AS providerId,
              system_prompt AS systemPrompt, parameters, created_at AS createdAt, updated_at AS updatedAt
       FROM conversations WHERE project_id = ? ORDER BY updated_at DESC`,
      [projectId]
    );
  }
  return db.all<Conversation>(
    `SELECT id, project_id AS projectId, title, model_id AS modelId, provider_id AS providerId,
            system_prompt AS systemPrompt, parameters, created_at AS createdAt, updated_at AS updatedAt
     FROM conversations ORDER BY updated_at DESC`
  );
}

/**
 * Update conversation metadata.
 */
export async function updateConversation(
  db: Database,
  id: string,
  updates: Partial<
    Pick<Conversation, 'title' | 'modelId' | 'providerId' | 'systemPrompt' | 'parameters'>
  >
): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    params.push(updates.title);
  }
  if (updates.modelId !== undefined) {
    fields.push('model_id = ?');
    params.push(updates.modelId);
  }
  if (updates.providerId !== undefined) {
    fields.push('provider_id = ?');
    params.push(updates.providerId);
  }
  if (updates.systemPrompt !== undefined) {
    fields.push('system_prompt = ?');
    params.push(updates.systemPrompt);
  }
  if (updates.parameters !== undefined) {
    fields.push('parameters = ?');
    params.push(updates.parameters);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);

  await db.run(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`, params);
}

/**
 * Update conversation timestamp (for sorting).
 */
export async function touchConversation(db: Database, id: string): Promise<void> {
  await db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [Date.now(), id]);
}

/**
 * Delete a conversation and all its messages.
 */
export async function deleteConversation(db: Database, id: string): Promise<void> {
  // Messages cascade deleted via FK
  await db.run('DELETE FROM conversations WHERE id = ?', [id]);
}

/**
 * Create a new message.
 */
export async function createMessage(
  db: Database,
  message: Omit<Message, 'createdAt'> & { createdAt?: number }
): Promise<void> {
  await db.run(
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
      message.createdAt ?? Date.now(),
    ]
  );
}

/**
 * Get all messages for a conversation.
 */
export async function getMessages(db: Database, conversationId: string): Promise<Message[]> {
  return db.all<Message>(
    `SELECT id, conversation_id AS conversationId, role, content, tool_calls AS toolCalls,
            tool_call_id AS toolCallId, attachments, model_id AS modelId, token_count AS tokenCount,
            cost, extra, created_at AS createdAt
     FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    [conversationId]
  );
}

/**
 * Get messages as NormalizedMessage for chat session.
 */
export async function getNormalizedMessages(
  db: Database,
  conversationId: string
): Promise<NormalizedMessage[]> {
  const messages = await getMessages(db, conversationId);
  return messages.map((m) => ({
    role: m.role as NormalizedMessage['role'],
    content: m.content,
    toolCalls: m.toolCalls ? (JSON.parse(m.toolCalls) as NormalizedMessage['toolCalls']) : undefined,
    toolCallId: m.toolCallId ?? undefined,
    attachments: m.attachments ? (JSON.parse(m.attachments) as NormalizedMessage['attachments']) : undefined,
    modelId: m.modelId ?? undefined,
    tokenCount: m.tokenCount ?? undefined,
    cost: m.cost ?? undefined,
    createdAt: m.createdAt,
    extra: m.extra ? (JSON.parse(m.extra) as Record<string, unknown>) : undefined,
  }));
}

/**
 * Delete all messages for a conversation.
 */
export async function deleteMessages(db: Database, conversationId: string): Promise<void> {
  await db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
}

/**
 * Get conversation with messages (for export).
 */
export async function getConversationWithMessages(
  db: Database,
  conversationId: string
): Promise<{ conversation: Conversation | undefined; messages: Message[] }> {
  const conversation = await getConversation(db, conversationId);
  const messages = await getMessages(db, conversationId);
  return { conversation, messages };
}

/**
 * Get recent conversations with last message preview.
 */
export async function getRecentConversations(
  db: Database,
  limit = 20,
  projectId?: string | null
): Promise<(Conversation & { lastMessage: string | null; messageCount: number })[]> {
  let query = `
    SELECT c.id, c.project_id as projectId, c.title, c.model_id as modelId, c.provider_id as providerId,
      c.system_prompt as systemPrompt, c.parameters, c.created_at as createdAt, c.updated_at as updatedAt,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as lastMessage,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as messageCount
    FROM conversations c
  `;
  const params: unknown[] = [];

  if (projectId) {
    query += ' WHERE c.project_id = ?';
    params.push(projectId);
  }

  query += ' ORDER BY c.updated_at DESC LIMIT ?';
  params.push(limit);

  return db.all(query, params);
}
