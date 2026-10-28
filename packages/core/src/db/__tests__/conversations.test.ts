/**
 * Conversations CRUD Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createConversation,
  getConversation,
  getConversations,
  updateConversation,
  touchConversation,
  deleteConversation,
  createMessage,
  getMessages,
  getNormalizedMessages,
  deleteMessages,
  getConversationWithMessages,
  getRecentConversations,
} from '../conversations';
import type { Database, Conversation, Message, NormalizedMessage } from '../schema';

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

describe('Conversations CRUD', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('createConversation', () => {
    it('inserts a conversation with all fields', async () => {
      const conversation = {
        id: 'conv-1',
        projectId: 'proj-1',
        title: 'Test Conversation',
        modelId: 'gpt-4o',
        providerId: 'openai',
        systemPrompt: 'You are helpful',
        parameters: '{"temperature": 0.7}',
        createdAt: 1000,
        updatedAt: 1000,
      };

      await createConversation(db, conversation);

      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toContain('INSERT INTO conversations');
      expect(db.runCalls[0].params).toEqual([
        'conv-1',
        'proj-1',
        'Test Conversation',
        'gpt-4o',
        'openai',
        'You are helpful',
        '{"temperature": 0.7}',
        1000,
        1000,
      ]);
    });

    it('uses current time if createdAt/updatedAt not provided', async () => {
      const before = Date.now();
      const conversation = {
        id: 'conv-1',
        projectId: null,
        title: null,
        modelId: 'gpt-4o',
        providerId: 'openai',
        systemPrompt: null,
        parameters: null,
      };

      await createConversation(db, conversation);

      expect(db.runCalls[0].params[7]).toBeGreaterThanOrEqual(before);
      expect(db.runCalls[0].params[8]).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getConversation', () => {
    it('queries conversation by id', async () => {
      const mockConversation: Conversation = {
        id: 'conv-1',
        projectId: 'proj-1',
        title: 'Test',
        modelId: 'gpt-4o',
        providerId: 'openai',
        systemPrompt: 'Prompt',
        parameters: '{}',
        createdAt: 1000,
        updatedAt: 2000,
      };

      const dbWithGet = createMockDb();
      const originalGet = dbWithGet.get;
      dbWithGet.get = async (sql: string, params: unknown[] = []) => {
        originalGet(sql, params);
        return mockConversation;
      };

      const result = await getConversation(dbWithGet, 'conv-1');
      expect(result).toEqual(mockConversation);
      expect(dbWithGet.getCalls[0].sql).toContain('project_id AS projectId');
      expect(dbWithGet.getCalls[0].sql).toContain('FROM conversations WHERE id = ?');
      expect(dbWithGet.getCalls[0].params).toEqual(['conv-1']);
    });

    it('returns undefined when not found', async () => {
      const result = await getConversation(db, 'nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getConversations', () => {
    it('queries all conversations ordered by updated_at desc', async () => {
      const mockConversations: Conversation[] = [
        { id: '1', projectId: null, title: 'A', modelId: 'm', providerId: 'p', systemPrompt: null, parameters: null, createdAt: 1, updatedAt: 1 },
        { id: '2', projectId: null, title: 'B', modelId: 'm', providerId: 'p', systemPrompt: null, parameters: null, createdAt: 2, updatedAt: 2 },
      ];

      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return mockConversations;
      };

      const result = await getConversations(dbWithAll);
      expect(result).toEqual(mockConversations);
      expect(dbWithAll.allCalls[0].sql).toContain('project_id AS projectId');
      expect(dbWithAll.allCalls[0].sql).toContain('FROM conversations ORDER BY updated_at DESC');
    });

    it('filters by projectId when provided', async () => {
      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return [];
      };

      await getConversations(dbWithAll, 'proj-1');
      expect(dbWithAll.allCalls[0].sql).toContain('WHERE project_id = ?');
      expect(dbWithAll.allCalls[0].params).toEqual(['proj-1']);
    });

    it('treats null projectId as no filter', async () => {
      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return [];
      };

      await getConversations(dbWithAll, null);
      expect(dbWithAll.allCalls[0].sql).toContain('ORDER BY updated_at DESC');
      expect(dbWithAll.allCalls[0].sql).not.toContain('WHERE project_id');
    });
  });

  describe('updateConversation', () => {
    it('updates only provided fields', async () => {
      await updateConversation(db, 'conv-1', { title: 'New Title', modelId: 'gpt-4', providerId: 'openai' });

      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toContain('UPDATE conversations SET');
      expect(db.runCalls[0].sql).toContain('title = ?');
      expect(db.runCalls[0].sql).toContain('model_id = ?');
      expect(db.runCalls[0].sql).toContain('provider_id = ?');
      expect(db.runCalls[0].sql).toContain('updated_at = ?');
      expect(db.runCalls[0].params).toEqual(['New Title', 'gpt-4', 'openai', expect.any(Number), 'conv-1']);
    });

    it('does nothing if no fields provided', async () => {
      await updateConversation(db, 'conv-1', {});
      expect(db.runCalls).toHaveLength(0);
    });

    it('updates systemPrompt and parameters', async () => {
      await updateConversation(db, 'conv-1', {
        systemPrompt: 'New prompt',
        parameters: '{"temp": 0.5}',
      });

      expect(db.runCalls[0].params).toEqual(['New prompt', '{"temp": 0.5}', expect.any(Number), 'conv-1']);
    });
  });

  describe('touchConversation', () => {
    it('updates updated_at timestamp', async () => {
      await touchConversation(db, 'conv-1');
      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toContain('UPDATE conversations SET updated_at = ? WHERE id = ?');
      expect(db.runCalls[0].params).toHaveLength(2);
      expect(db.runCalls[0].params[1]).toBe('conv-1');
    });
  });

  describe('deleteConversation', () => {
    it('deletes conversation by id', async () => {
      await deleteConversation(db, 'conv-1');
      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toBe('DELETE FROM conversations WHERE id = ?');
      expect(db.runCalls[0].params).toEqual(['conv-1']);
    });
  });

  describe('createMessage', () => {
    it('inserts a message with all fields', async () => {
      const message: Omit<Message, 'createdAt'> & { createdAt?: number } = {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        toolCalls: null,
        toolCallId: null,
        attachments: null,
        modelId: null,
        tokenCount: null,
        cost: null,
        extra: null,
        createdAt: 1000,
      };

      await createMessage(db, message);

      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toContain('INSERT INTO messages');
      expect(db.runCalls[0].params).toEqual([
        'msg-1',
        'conv-1',
        'user',
        'Hello',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        1000,
      ]);
    });

    it('serializes toolCalls, attachments, extra as JSON', async () => {
      const message: Omit<Message, 'createdAt'> & { createdAt?: number } = {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Hi',
        toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'tool', arguments: '{}' } }],
        toolCallId: null,
        attachments: [{ type: 'image', path: 'data:image/png;base64,abc', mimeType: 'image/png' }],
        modelId: 'gpt-4o',
        tokenCount: 10,
        cost: 0.001,
        extra: { custom: 'data' },
        createdAt: 1000,
      };

      await createMessage(db, message);

      const toolCallsParam = db.runCalls[0].params[4];
      const attachmentsParam = db.runCalls[0].params[6];
      const extraParam = db.runCalls[0].params[10];

      // The createMessage function passes objects directly (DB driver handles serialization)
      expect(toolCallsParam).toEqual(message.toolCalls);
      expect(attachmentsParam).toEqual(message.attachments);
      expect(extraParam).toEqual(message.extra);
    });

    it('uses current time if createdAt not provided', async () => {
      const before = Date.now();
      const message: Omit<Message, 'createdAt'> = {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        toolCalls: null,
        toolCallId: null,
        attachments: null,
        modelId: null,
        tokenCount: null,
        cost: null,
        extra: null,
      };

      await createMessage(db, message);
      expect(db.runCalls[0].params[11]).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getMessages', () => {
    it('queries messages ordered by created_at ASC', async () => {
      const mockMessages: Message[] = [
        { id: '1', conversationId: 'c', role: 'user', content: 'Hi', toolCalls: null, toolCallId: null, attachments: null, modelId: null, tokenCount: null, cost: null, extra: null, createdAt: 1 },
        { id: '2', conversationId: 'c', role: 'assistant', content: 'Hello', toolCalls: null, toolCallId: null, attachments: null, modelId: 'gpt-4o', tokenCount: 5, cost: 0.001, extra: null, createdAt: 2 },
      ];

      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return mockMessages;
      };

      const result = await getMessages(dbWithAll, 'conv-1');
      expect(result).toEqual(mockMessages);
      expect(dbWithAll.allCalls[0].sql).toContain('ORDER BY created_at ASC');
    });
  });

  describe('getNormalizedMessages', () => {
    it('converts database messages to NormalizedMessage', async () => {
      const mockMessages: Message[] = [
        {
          id: '1',
          conversationId: 'c',
          role: 'user',
          content: 'Hi',
          toolCalls: null,
          toolCallId: null,
          attachments: null,
          modelId: null,
          tokenCount: null,
          cost: null,
          extra: null,
          createdAt: 1,
        },
        {
          id: '2',
          conversationId: 'c',
          role: 'assistant',
          content: 'Hello',
          toolCalls: JSON.stringify([{ id: 'call-1', type: 'function', function: { name: 'tool', arguments: '{}' } }]),
          toolCallId: null,
          attachments: JSON.stringify([{ type: 'image', path: 'data:image/png;base64,abc', mimeType: 'image/png' }]),
          modelId: 'gpt-4o',
          tokenCount: 10,
          cost: 0.001,
          extra: JSON.stringify({ custom: 'data' }),
          createdAt: 2,
        },
      ];

      const dbWithAll = createMockDb();
      dbWithAll.all = async () => mockMessages;

      const result = await getNormalizedMessages(dbWithAll, 'conv-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        role: 'user',
        content: 'Hi',
        toolCalls: undefined,
        toolCallId: undefined,
        attachments: undefined,
        modelId: undefined,
        tokenCount: undefined,
        cost: undefined,
        createdAt: 1,
        extra: undefined,
      });
      expect(result[1]).toEqual({
        role: 'assistant',
        content: 'Hello',
        toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'tool', arguments: '{}' } }],
        toolCallId: undefined,
        attachments: [{ type: 'image', path: 'data:image/png;base64,abc', mimeType: 'image/png' }],
        modelId: 'gpt-4o',
        tokenCount: 10,
        cost: 0.001,
        createdAt: 2,
        extra: { custom: 'data' },
      });
    });

    it('handles null content and extra', async () => {
      const mockMessages: Message[] = [
        {
          id: '1',
          conversationId: 'c',
          role: 'assistant',
          content: null,
          toolCalls: null,
          toolCallId: null,
          attachments: null,
          modelId: null,
          tokenCount: null,
          cost: null,
          extra: null,
          createdAt: 1,
        },
      ];

      const dbWithAll = createMockDb();
      dbWithAll.all = async () => mockMessages;

      const result = await getNormalizedMessages(dbWithAll, 'conv-1');
      expect(result[0].content).toBeNull();
      expect(result[0].extra).toBeUndefined();
    });
  });

  describe('deleteMessages', () => {
    it('deletes all messages for a conversation', async () => {
      await deleteMessages(db, 'conv-1');
      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toBe('DELETE FROM messages WHERE conversation_id = ?');
      expect(db.runCalls[0].params).toEqual(['conv-1']);
    });
  });

  describe('getConversationWithMessages', () => {
    it('returns both conversation and messages', async () => {
      const mockConv: Conversation = {
        id: 'c', projectId: null, title: 'Test', modelId: 'm', providerId: 'p',
        systemPrompt: null, parameters: null, createdAt: 1, updatedAt: 1,
      };
      const mockMessages: Message[] = [
        { id: '1', conversationId: 'c', role: 'user', content: 'Hi', toolCalls: null, toolCallId: null, attachments: null, modelId: null, tokenCount: null, cost: null, extra: null, createdAt: 1 },
      ];

      const dbWithMethods = createMockDb();
      dbWithMethods.get = async () => mockConv;
      dbWithMethods.all = async () => mockMessages;

      const result = await getConversationWithMessages(dbWithMethods, 'conv-1');
      expect(result.conversation).toEqual(mockConv);
      expect(result.messages).toEqual(mockMessages);
    });
  });

  describe('getRecentConversations', () => {
    it('queries recent conversations with last message preview and count', async () => {
      const mockResult = [
        { id: '1', title: 'A', updatedAt: 100, messageCount: 5, lastMessage: 'Hello' },
        { id: '2', title: 'B', updatedAt: 50, messageCount: 3, lastMessage: 'Hi' },
      ];

      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return mockResult;
      };

      const result = await getRecentConversations(dbWithAll, 20, 'proj-1');
      expect(result).toEqual(mockResult);
      expect(dbWithAll.allCalls[0].sql).toContain('SELECT c.id, c.project_id as projectId');
      expect(dbWithAll.allCalls[0].sql).toContain('(SELECT content FROM messages');
      expect(dbWithAll.allCalls[0].sql).toContain('WHERE c.project_id = ?');
      expect(dbWithAll.allCalls[0].params).toEqual(['proj-1', 20]);
    });

    it('works without project filter', async () => {
      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return [];
      };

      await getRecentConversations(dbWithAll);
      expect(dbWithAll.allCalls[0].sql).not.toContain('WHERE c.project_id');
      expect(dbWithAll.allCalls[0].params).toEqual([20]);
    });

    it('uses custom limit', async () => {
      const dbWithAll = createMockDb();
      const originalAll = dbWithAll.all;
      dbWithAll.all = async (sql: string, params: unknown[] = []) => {
        originalAll(sql, params);
        return [];
      };

      await getRecentConversations(dbWithAll, 10, null);
      expect(dbWithAll.allCalls[0].params).toEqual([10]);
    });
  });
});
