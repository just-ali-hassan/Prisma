/**
 * FTS5 Full-Text Search
 *
 * Search conversations and messages using SQLite FTS5.
 */

import type { Database } from './schema';

export interface SearchResult {
  conversationId: string;
  title: string | null;
  snippet: string;
  timestamp: number;
  messageId: string;
}

/**
 * Search messages by content.
 */
export async function searchMessages(
  db: Database,
  query: string,
  limit = 20,
  offset = 0
): Promise<SearchResult[]> {
  // Sanitize query for FTS5
  const sanitized = query
    .replace(/"/g, '""')
    .replace(/[^\w\s-]/g, ' ')
    .trim();

  if (!sanitized) return [];

  // Use FTS5 match with snippet generation
  const rows = await db.all<{
    conversation_id: string;
    title: string | null;
    content: string;
    created_at: number;
    id: string;
  }>(
    `SELECT m.conversation_id, c.title, m.content, m.created_at, m.id
     FROM messages_fts f
     JOIN messages m ON m.rowid = f.rowid
     JOIN conversations c ON c.id = m.conversation_id
     WHERE messages_fts MATCH ?
     ORDER BY rank
     LIMIT ? OFFSET ?`,
    [sanitized, limit, offset]
  );

  return rows.map((r) => ({
    conversationId: r.conversation_id,
    title: r.title,
    snippet: generateSnippet(r.content, sanitized),
    timestamp: r.created_at,
    messageId: r.id,
  }));
}

/**
 * Generate a snippet around the search terms.
 */
export function generateSnippet(content: string | null, query: string): string {
  if (!content) return '';

  const terms = query
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .map((t) => t.replace(/[^\w]/g, ''));

  if (terms.length === 0) {
    return content.slice(0, 200) + (content.length > 200 ? '...' : '');
  }

  // Find first occurrence of any term
  let bestIndex = -1;
  for (const term of terms) {
    const index = content.toLowerCase().indexOf(term.toLowerCase());
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
    }
  }

  if (bestIndex === -1) {
    return content.slice(0, 200) + (content.length > 200 ? '...' : '');
  }

  const start = Math.max(0, bestIndex - 100);
  const end = Math.min(content.length, bestIndex + 200);
  let snippet = content.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Search conversations by title.
 */
export async function searchConversations(
  db: Database,
  query: string,
  limit = 20
): Promise<{ id: string; title: string | null; updatedAt: number }[]> {
  const sanitized = `%${query.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

  return db.all(
    `SELECT id, title, updated_at as updatedAt
     FROM conversations
     WHERE title LIKE ? ESCAPE '\\'
     ORDER BY updated_at DESC
     LIMIT ?`,
    [sanitized, limit]
  );
}
