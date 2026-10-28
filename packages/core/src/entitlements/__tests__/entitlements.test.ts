/**
 * Entitlements Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeEntitlements,
  refreshEntitlementsCache,
  checkEntitlement,
  isEntitlementEnabled,
  getAllEntitlements,
  setEntitlement,
  EntitlementError,
  createEntitlementChecker,
  requireEntitlement,
  resetEntitlementsForTesting,
} from '../entitlements';
import type { Database } from '../../db/schema';

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

describe('Entitlements', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    db = createMockDb();
    // Reset internal state and initialize with default entitlements
    vi.resetModules();
    await initializeEntitlements(db);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initializeEntitlements', () => {
    it('inserts default entitlements if not present', async () => {
      const inserts = db.runCalls.filter(c => c.sql.includes('INSERT OR IGNORE INTO entitlements'));
      expect(inserts).toHaveLength(7); // voice, image_gen, agents, mcp, skills, plugins, video_input
    });

    it('loads entitlements into cache', async () => {
      const dbWithAll = createMockDb();
      dbWithAll.all = async () => [
        { feature: 'voice', enabled: 1 },
        { feature: 'image_gen', enabled: 0 },
      ];

      await initializeEntitlements(dbWithAll);

      expect(isEntitlementEnabled('voice')).toBe(true);
      expect(isEntitlementEnabled('image_gen')).toBe(false);
      expect(isEntitlementEnabled('agents')).toBe(true); // default enabled
    });
  });

  describe('refreshEntitlementsCache', () => {
    it('refreshes cache from database', async () => {
      db.allCalls.length = 0;
      db.all = async () => [
        { feature: 'voice', enabled: 0 },
        { feature: 'agents', enabled: 1 },
      ];

      await refreshEntitlementsCache();

      expect(isEntitlementEnabled('voice')).toBe(false);
      expect(isEntitlementEnabled('agents')).toBe(true);
    });

    it('does nothing if db not initialized', async () => {
      resetEntitlementsForTesting();
      await expect(refreshEntitlementsCache()).resolves.not.toThrow();
    });
  });

  describe('checkEntitlement', () => {
    it('does nothing when enabled', () => {
      expect(() => checkEntitlement('voice')).not.toThrow();
    });

    it('throws EntitlementError when disabled', async () => {
      // Disable voice entitlement
      db.allCalls.length = 0;
      db.all = async () => [{ feature: 'voice', enabled: 0 }];
      await refreshEntitlementsCache();

      expect(() => checkEntitlement('voice')).toThrow(EntitlementError);
    });
  });

  describe('isEntitlementEnabled', () => {
    it('returns true for all default entitlements', () => {
      expect(isEntitlementEnabled('voice')).toBe(true);
      expect(isEntitlementEnabled('image_gen')).toBe(true);
      expect(isEntitlementEnabled('agents')).toBe(true);
      expect(isEntitlementEnabled('mcp')).toBe(true);
      expect(isEntitlementEnabled('skills')).toBe(true);
      expect(isEntitlementEnabled('plugins')).toBe(true);
      expect(isEntitlementEnabled('video_input')).toBe(true);
    });

    it('returns false for unknown feature', () => {
      // @ts-expect-error - testing unknown feature
      expect(isEntitlementEnabled('unknown')).toBe(false);
    });

    it('returns default when cache not initialized', () => {
      resetEntitlementsForTesting();
      expect(isEntitlementEnabled('voice')).toBe(true);
      expect(isEntitlementEnabled('unknown' as any)).toBe(false);
      expect(getAllEntitlements().voice).toBe(true);
    });
  });

  describe('getAllEntitlements', () => {
    it('returns all entitlements with current state', async () => {
      const dbWithAll = createMockDb();
      dbWithAll.all = async () => [
        { feature: 'voice', enabled: 1 },
        { feature: 'agents', enabled: 0 },
      ];
      await initializeEntitlements(dbWithAll);

      const all = getAllEntitlements();
      expect(all.voice).toBe(true);
      expect(all.agents).toBe(false);
      expect(all.image_gen).toBe(true);
    });
  });

  describe('setEntitlement', () => {
    it('updates database and refreshes cache', async () => {
      const dbWithAll = createMockDb();
      dbWithAll.all = async () => [
        { feature: 'voice', enabled: 1 },
      ];
      await initializeEntitlements(dbWithAll);

      // Update the mock to return the new value after update
      dbWithAll.all = async () => [
        { feature: 'voice', enabled: 0 },
      ];

      await setEntitlement('voice', false);

      expect(dbWithAll.runCalls).toContainEqual(
        expect.objectContaining({
          sql: 'UPDATE entitlements SET enabled = ? WHERE feature = ?',
          params: [0, 'voice'],
        })
      );
      expect(isEntitlementEnabled('voice')).toBe(false);

      await setEntitlement('voice', true);
      expect(dbWithAll.runCalls).toContainEqual(
        expect.objectContaining({
          sql: 'UPDATE entitlements SET enabled = ? WHERE feature = ?',
          params: [1, 'voice'],
        })
      );
    });

    it('throws if entitlements not initialized', async () => {
      resetEntitlementsForTesting();
      await expect(setEntitlement('voice', true)).rejects.toThrow('Entitlements not initialized');
    });
  });

  describe('EntitlementError', () => {
    it('has correct code and feature', () => {
      const error = new EntitlementError('Voice disabled', 'voice');
      expect(error.code).toBe('ENTITLEMENT_DISABLED');
      expect(error.feature).toBe('voice');
      expect(error.message).toBe('Voice disabled');
    });
  });

  describe('createEntitlementChecker', () => {
    it('returns object with check, isEnabled, getAll, set methods', async () => {
      const checker = createEntitlementChecker();
      expect(typeof checker.check).toBe('function');
      expect(typeof checker.isEnabled).toBe('function');
      expect(typeof checker.getAll).toBe('function');
      expect(typeof checker.set).toBe('function');
    });
  });

  describe('requireEntitlement decorator', () => {
    it('allows method when entitlement enabled', async () => {
      const decorator = requireEntitlement('voice');
      const descriptor = {
        value: async () => 'success',
        writable: true,
        configurable: true,
        enumerable: true,
      };
      const wrapped = decorator({}, 'testMethod', descriptor);
      const result = await wrapped.value?.();
      expect(result).toBe('success');
    });

    it('throws when entitlement disabled', async () => {
      const dbWithAll = createMockDb();
      dbWithAll.all = async () => [{ feature: 'voice', enabled: 0 }];
      await initializeEntitlements(dbWithAll);

      const decorator = requireEntitlement('voice');
      const descriptor = {
        value: async () => 'success',
        writable: true,
        configurable: true,
        enumerable: true,
      };
      const wrapped = decorator({}, 'testMethod', descriptor);
      await expect(wrapped.value?.()).rejects.toThrow(EntitlementError);
    });

    it('handles undefined descriptor fallback', async () => {
      const decorator = requireEntitlement('voice');
      const wrapped = decorator({}, 'testMethod', undefined);
      const result = await wrapped.value?.();
      expect(result).toBeUndefined();
    });
  });
});