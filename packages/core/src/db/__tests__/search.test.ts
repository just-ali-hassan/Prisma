/**
 * FTS5 Search Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchMessages, searchConversations, generateSnippet } from '../search';
import type { Database } from '../schema';

// Mock database implementation
const createMockDb = (): Database & {
  executedSql: string[];
  runCalls: { sql: string; params: unknown[] }[];
  getCalls: { sql: string; params: unknown[] }[];
  allCalls: { sql: string; params: unknown[] }[];
} => {
  const executedSql: string[] = [];
  const runCalls: { sql: string; params: unknown[] }[] = [];
  const getCalls: { sql: string; params: unknown[] }[] = [];
  const allCalls: { sql: string; params: unknown[] }[] = [];

  return {
    executedSql,
    runCalls,
    getCalls,
    allCalls,
    async exec(sql: string) {
      executedSql.push(sql);
    },
    async run(sql: string, params: unknown[] = []) {
      runCalls.push({ sql, params });
      return { lastInsertRowid: 1, changes: 1 };
    },
    async get<T>(sql: string, params: unknown[] = []) {
      getCalls.push({ sql, params });
      return undefined as T | undefined;
    },
    async all<T>(sql: string, params: unknown[] = []) {
      allCalls.push({ sql, params });
      return [] as T[];
    },
    async close() {},
  };
};

describe('FTS5 Search', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('searchMessages', () => {
    it('sanitizes query for FTS5', async () => {
      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return [];
      };

      // The sanitization replaces " with "" then non-word chars with space
      // Input: hello "world" test! -> hello ""world"" test! -> hello   world   test (no trailing space)
      await searchMessages(dbWithAll, 'hello "world" test!');
      expect(dbWithAll.allCalls[0].params[0]).toBe('hello   world   test');
    });

    it('returns empty array for empty query', async () => {
      const result = await searchMessages(db, '');
      expect(result).toEqual([]);
    });

    it('returns empty array for whitespace only query', async () => {
      const result = await searchMessages(db, '   ');
      expect(result).toEqual([]);
    });

    it('queries FTS5 with proper joins', async () => {
      const mockResults = [
        {
          conversation_id: 'conv-1',
          title: 'Test Conversation',
          content: 'This is a test message about hello world',
          created_at: 1000,
          id: 'msg-1',
        },
      ];

      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return mockResults;
      };

      const result = await searchMessages(dbWithAll, 'hello world');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        conversationId: 'conv-1',
        title: 'Test Conversation',
        snippet: expect.any(String),
        timestamp: 1000,
        messageId: 'msg-1',
      });
      expect(dbWithAll.allCalls[0].sql).toContain('messages_fts');
      expect(dbWithAll.allCalls[0].sql).toContain('JOIN messages');
      expect(dbWithAll.allCalls[0].sql).toContain('JOIN conversations');
      expect(dbWithAll.allCalls[0].sql).toContain('MATCH ?');
      expect(dbWithAll.allCalls[0].sql).toContain('ORDER BY rank');
    });

    it('creates fallback snippet when terms array is empty or term not found in content', async () => {
      const dbWithAll = createMockDb();
      dbWithAll.all = async () => [
        {
          conversation_id: 'conv-1',
          title: 'Test Conversation',
          content: 'A long content message '.repeat(15),
          created_at: 1000,
          id: 'msg-1',
        },
      ];

      // Query where single-letter word is filtered out: terms.length === 0
      const res1 = await searchMessages(dbWithAll, 'a a');
      expect(res1[0].snippet).toContain('...');

      // Query where term is not in content: bestIndex === -1
      const res2 = await searchMessages(dbWithAll, 'nonexistentterm');
      expect(res2[0].snippet).toContain('...');

      // Short content without ellipsis
      expect(generateSnippet('short', 'a')).toBe('short');
      expect(generateSnippet('short', 'xyz')).toBe('short');
    });

    it('applies limit and offset', async () => {
      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return [];
      };

      await searchMessages(dbWithAll, 'test', 10, 5);
      expect(dbWithAll.allCalls[0].sql).toContain('LIMIT ? OFFSET ?');
      expect(dbWithAll.allCalls[0].params).toEqual(['test', 10, 5]);
    });
  });

  describe('searchConversations', () => {
    it('sanitizes query for LIKE', async () => {
      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return [];
      };

      await searchConversations(dbWithAll, 'test%name_');
      expect(dbWithAll.allCalls[0].params[0]).toBe('%test\\%name\\_%');
    });

    it('queries conversations by title', async () => {
      const mockResults = [
        { id: 'conv-1', title: 'Test', updated_at: 1000 },
      ];

      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return mockResults;
      };

      const result = await searchConversations(dbWithAll, 'test');
      expect(result).toEqual(mockResults);
      expect(dbWithAll.allCalls[0].sql).toContain('WHERE title LIKE ?');
      expect(dbWithAll.allCalls[0].sql).toContain('ESCAPE');
    });

    it('applies limit', async () => {
      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return [];
      };

      await searchConversations(dbWithAll, 'test', 5);
      expect(dbWithAll.allCalls[0].sql).toContain('LIMIT ?');
      expect(dbWithAll.allCalls[0].params).toEqual(['%test%', 5]);
    });
  });

  describe('generateSnippet', () => {
    it('returns empty string for null content', () => {
      expect(generateSnippet(null, 'test')).toBe('');
    });

    it('returns truncated content when query has no terms longer than 1 char', () => {
      const content = 'A'.repeat(250);
      expect(generateSnippet(content, '? a !')).toBe('A'.repeat(200) + '...');
    });

    it('returns truncated content when no terms found', () => {
      const content = 'A'.repeat(250); // 250 chars, longer than 200
      const result = generateSnippet(content, 'nonexistent');
      expect(result).toBe('A'.repeat(200) + '...');
    });

    it('finds first occurrence of any search term', () => {
      const content = 'A'.repeat(150) + ' fox ' + 'B'.repeat(150) + ' dog ' + 'C'.repeat(150);
      const result = generateSnippet(content, 'fox dog');
      expect(result).toContain('fox');
      // Should start near 'fox' which comes before 'dog'
      expect(result.startsWith('...')).toBe(true);
    });

    it('includes context around match', () => {
      const content = 'A'.repeat(200) + ' match here ' + 'B'.repeat(200);
      const result = generateSnippet(content, 'match');
      expect(result).toContain('match');
      expect(result.startsWith('...')).toBe(true);
      expect(result.endsWith('...')).toBe(true);
    });

    it('handles multiple terms', () => {
      const content = 'First term is here and second term is there';
      const result = generateSnippet(content, 'first second');
      expect(result).toContain('First');
    });

    it('truncates at 200 chars after match', () => {
      const content = 'prefix ' + 'match' + ' suffix'.repeat(50);
      const result = generateSnippet(content, 'match');
      expect(result.length).toBeLessThanOrEqual(310); // ~100 before + match + ~200 after + ellipsis
    });
  });
});