/**
 * Database Schema Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initializeDatabase,
  SCHEMA_VERSION,
  CREATE_TABLES,
  MIGRATIONS,
  DEFAULT_ENTITLEMENTS,
  transaction,
} from '../schema';
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

describe('Database Schema', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('SCHEMA_VERSION', () => {
    it('is defined and is a number', () => {
      expect(SCHEMA_VERSION).toBeDefined();
      expect(typeof SCHEMA_VERSION).toBe('number');
      expect(SCHEMA_VERSION).toBeGreaterThan(0);
    });
  });

  describe('CREATE_TABLES', () => {
    it('contains all required table creation statements', () => {
      const sql = CREATE_TABLES.join('\n');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS conversations');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS messages');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS projects');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS project_files');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS mcp_connectors');
      expect(sql).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts');
      expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS messages_fts_insert');
      expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS messages_fts_update');
      expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS messages_fts_delete');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS settings');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS entitlements');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS schema_version');
    });

    it('has proper foreign key constraints', () => {
      const sql = CREATE_TABLES.join('\n');
      expect(sql).toContain('FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL');
      expect(sql).toContain('FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE');
    });

    it('has proper indexes', () => {
      const sql = CREATE_TABLES.join('\n');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_messages_conversation_id');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_messages_created_at');
    });
  });

  describe('MIGRATIONS', () => {
    it('is an object', () => {
      expect(MIGRATIONS).toBeDefined();
      expect(typeof MIGRATIONS).toBe('object');
    });

    it('has no migrations for version 1 (initial schema)', () => {
      expect(MIGRATIONS[1]).toBeUndefined();
    });
  });

  describe('DEFAULT_ENTITLEMENTS', () => {
    it('contains all expected entitlements', () => {
      expect(DEFAULT_ENTITLEMENTS).toContain('voice');
      expect(DEFAULT_ENTITLEMENTS).toContain('image_gen');
      expect(DEFAULT_ENTITLEMENTS).toContain('agents');
      expect(DEFAULT_ENTITLEMENTS).toContain('mcp');
      expect(DEFAULT_ENTITLEMENTS).toContain('skills');
      expect(DEFAULT_ENTITLEMENTS).toContain('plugins');
      expect(DEFAULT_ENTITLEMENTS).toContain('video_input');
    });
  });

  describe('initializeDatabase', () => {
    it('executes all CREATE_TABLES statements', async () => {
      await initializeDatabase(db);
      expect(db.executedSql.length).toBe(CREATE_TABLES.length);
      for (const sql of CREATE_TABLES) {
        expect(db.executedSql).toContain(sql);
      }
    });

    it('executes migration statements if defined in MIGRATIONS', async () => {
      MIGRATIONS[1] = ['ALTER TABLE conversations ADD COLUMN test_col TEXT;'];
      try {
        await initializeDatabase(db);
        expect(db.executedSql).toContain('ALTER TABLE conversations ADD COLUMN test_col TEXT;');
      } finally {
        delete MIGRATIONS[1];
      }
    });

    it('checks current schema version', async () => {
      db.getCalls.length = 0;
      await initializeDatabase(db);
      expect(db.getCalls.length).toBeGreaterThan(0);
      expect(db.getCalls[0].sql).toContain('SELECT version FROM schema_version');
    });

    it('runs migrations for new versions', async () => {
      // Mock a scenario where version is 0 and we need to apply version 1
      db.getCalls.length = 0;
      db.getCalls.push({
        sql: 'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
        params: [],
      });
      // Simulate the get returning undefined (version 0)
      const originalGet = db.get;
      db.get = async () => ({ version: 0 });

      await initializeDatabase(db);

      // Should record migration for version 1
      const versionInserts = db.runCalls.filter(
        (call) => call.sql.includes('INSERT OR REPLACE INTO schema_version')
      );
      expect(versionInserts.length).toBeGreaterThan(0);
    });

    it('initializes default entitlements', async () => {
      db.runCalls.length = 0;
      await initializeDatabase(db);
      const entitlementInserts = db.runCalls.filter(
        (call) => call.sql.includes('INSERT OR IGNORE INTO entitlements')
      );
      expect(entitlementInserts.length).toBe(DEFAULT_ENTITLEMENTS.length);
    });
  });

  describe('transaction', () => {
    it('executes BEGIN, fn, and COMMIT', async () => {
      db.executedSql.length = 0;
      const result = await transaction(db, async () => 'success');
      expect(result).toBe('success');
      expect(db.executedSql).toContain('BEGIN TRANSACTION');
      expect(db.executedSql).toContain('COMMIT');
    });

    it('executes ROLLBACK on error', async () => {
      db.executedSql.length = 0;
      await expect(
        transaction(db, async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
      expect(db.executedSql).toContain('BEGIN TRANSACTION');
      expect(db.executedSql).toContain('ROLLBACK');
    });
  });
});