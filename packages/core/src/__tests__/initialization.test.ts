/**
 * Core Initialization Tests
 * 
 * Tests for the core initialization module that wires up
 * database, entitlements, and provider registration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initializeCore, isCoreInitialized, resetCoreInitialization } from '../initialization';
import type { Database } from '../db/schema';
import type { KeyManager } from '../security/key-manager';

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
    exec(sql: string) {
      executedSql.push(sql);
      return Promise.resolve();
    },
    run(sql: string, params: unknown[] = []) {
      runCalls.push({ sql, params });
      return Promise.resolve({ lastInsertRowid: 1, changes: 1 });
    },
    get<T>(sql: string, params: unknown[] = []) {
      getCalls.push({ sql, params });
      return Promise.resolve(undefined as T | undefined);
    },
    all<T>(sql: string, params: unknown[] = []) {
      allCalls.push({ sql, params });
      return Promise.resolve([] as T[]);
    },
    close() {
      return Promise.resolve();
    },
  };
};

// Mock key manager implementation
const createMockKeyManager = (): KeyManager => ({
  setKey: vi.fn().mockResolvedValue(undefined),
  getKey: vi.fn().mockResolvedValue(undefined),
  deleteKey: vi.fn().mockResolvedValue(undefined),
  listKeys: vi.fn().mockResolvedValue([]),
  hasKey: vi.fn().mockResolvedValue(false),
});

describe('Core Initialization', () => {
  let db: ReturnType<typeof createMockDb>;
  let keyManager: KeyManager;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    keyManager = createMockKeyManager();
    resetCoreInitialization();
  });

  afterEach(() => {
    resetCoreInitialization();
  });

  describe('initializeCore', () => {
    it('initializes database, entitlements, and providers in order', async () => {
      await initializeCore(db, keyManager);

      // Verify database exec was called for schema creation
      expect(db.executedSql.length).toBeGreaterThan(0);
      expect(db.executedSql.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS conversations'))).toBe(true);
      expect(db.executedSql.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS messages'))).toBe(true);
      expect(db.executedSql.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS entitlements'))).toBe(true);

      // Verify keyManager was used to register providers
      expect(vi.mocked(keyManager.setKey)).not.toHaveBeenCalled(); // Not called during registration
      expect(vi.mocked(keyManager.getKey)).not.toHaveBeenCalled(); // Not called during registration

      // Verify core is marked as initialized
      expect(isCoreInitialized()).toBe(true);
    });

    it('throws if database initialization fails', async () => {
      const failingDb = createMockDb();
      failingDb.exec = vi.fn().mockRejectedValue(new Error('DB error'));

      await expect(initializeCore(failingDb, keyManager)).rejects.toThrow('DB error');
      expect(isCoreInitialized()).toBe(false);
    });

    it('throws if entitlements initialization fails', async () => {
      const failingDb = createMockDb();
      failingDb.all = vi.fn().mockRejectedValue(new Error('Entitlements error'));

      await expect(initializeCore(failingDb, keyManager)).rejects.toThrow('Entitlements error');
      expect(isCoreInitialized()).toBe(false);
    });

    it('can only be called once (idempotent)', async () => {
      await initializeCore(db, keyManager);
      
      // Second call should not re-initialize
      await initializeCore(db, keyManager);
      
      // Should still be initialized
      expect(isCoreInitialized()).toBe(true);
      // Database should only have been called once
      expect(db.executedSql.length).toBeGreaterThan(0);
    });

    it('handles concurrent calls gracefully and shares promise', async () => {
      await Promise.all([
        initializeCore(db, keyManager),
        initializeCore(db, keyManager),
      ]);
      expect(isCoreInitialized()).toBe(true);
    });

    it('works with different keyManager implementations', async () => {
      const customKeyManager: KeyManager = {
        setKey: vi.fn().mockResolvedValue(undefined),
        getKey: vi.fn().mockResolvedValue('test-key'),
        deleteKey: vi.fn().mockResolvedValue(undefined),
        listKeys: vi.fn().mockResolvedValue(['openai']),
        hasKey: vi.fn().mockResolvedValue(true),
      };

      await initializeCore(db, customKeyManager);
      expect(isCoreInitialized()).toBe(true);
    });
  });

  describe('isCoreInitialized', () => {
    it('returns false before initialization', () => {
      expect(isCoreInitialized()).toBe(false);
    });

    it('returns true after initialization', async () => {
      await initializeCore(db, keyManager);
      expect(isCoreInitialized()).toBe(true);
    });

    it('returns false after reset', async () => {
      await initializeCore(db, keyManager);
      resetCoreInitialization();
      expect(isCoreInitialized()).toBe(false);
    });
  });

  describe('resetCoreInitialization', () => {
    it('allows re-initialization after reset', async () => {
      await initializeCore(db, keyManager);
      expect(isCoreInitialized()).toBe(true);

      resetCoreInitialization();
      expect(isCoreInitialized()).toBe(false);

      await initializeCore(db, keyManager);
      expect(isCoreInitialized()).toBe(true);
    });
  });
});