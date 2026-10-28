/**
 * Settings Store Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSettingsStore } from '../settings';
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

describe('Settings Store', () => {
  let db: ReturnType<typeof createMockDb>;
  let store: ReturnType<typeof createSettingsStore>;

  beforeEach(() => {
    db = createMockDb();
    store = createSettingsStore(db);
  });

  describe('get', () => {
    it('returns default value when key not found', async () => {
      const result = await store.get('nonexistent', 'default');
      expect(result).toBe('default');
    });

    it('parses JSON value from database', async () => {
      const dbWithGet = createMockDb();
      dbWithGet.get = async () => ({ value: JSON.stringify({ key: 'value' }) });
      const storeWithDb = createSettingsStore(dbWithGet);

      const result = await storeWithDb.get('test', 'default');
      expect(result).toEqual({ key: 'value' });
    });

    it('returns default value on JSON parse error', async () => {
      const dbWithGet = createMockDb();
      dbWithGet.get = async () => ({ value: 'invalid json' });
      const storeWithDb = createSettingsStore(dbWithGet);

      const result = await storeWithDb.get('test', 'default');
      expect(result).toBe('default');
    });
  });

  describe('set', () => {
    it('serializes value as JSON and stores', async () => {
      await store.set('test', { key: 'value', num: 42 });

      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toContain('INSERT OR REPLACE INTO settings');
      expect(db.runCalls[0].params).toEqual(['test', JSON.stringify({ key: 'value', num: 42 })]);
    });

    it('handles primitive values', async () => {
      await store.set('string', 'hello');
      await store.set('number', 42);
      await store.set('boolean', true);
      await store.set('null', null);

      expect(db.runCalls[0].params[1]).toBe('"hello"');
      expect(db.runCalls[1].params[1]).toBe('42');
      expect(db.runCalls[2].params[1]).toBe('true');
      expect(db.runCalls[3].params[1]).toBe('null');
    });
  });

  describe('delete', () => {
    it('deletes key from database', async () => {
      await store.delete('test');

      expect(db.runCalls).toHaveLength(1);
      expect(db.runCalls[0].sql).toBe('DELETE FROM settings WHERE key = ?');
      expect(db.runCalls[0].params).toEqual(['test']);
    });
  });

  describe('getAll', () => {
    it('returns all settings as key-value pairs', async () => {
      const dbWithAll = createMockDb();
      dbWithAll.all = async () => [
        { key: 'key1', value: '"value1"' },
        { key: 'key2', value: '42' },
        { key: 'key3', value: 'true' },
      ];
      const storeWithDb = createSettingsStore(dbWithAll);

      const result = await storeWithDb.getAll();
      expect(result).toEqual({
        key1: '"value1"',
        key2: '42',
        key3: 'true',
      });
    });

    it('returns empty object when no settings', async () => {
      const result = await store.getAll();
      expect(result).toEqual({});
    });
  });
});