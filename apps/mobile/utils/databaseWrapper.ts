/**
 * Mobile Database Wrapper
 * 
 * Implements the core Database interface using expo-sqlite.
 */

import * as SQLite from 'expo-sqlite';
import type { Database as CoreDatabase } from '@prisma-ai/core/db/schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('prisma.db');
  }
  return dbInstance;
}

function convertParams(params?: unknown[]): (string | number | null)[] {
  if (!params) return [];
  return params.map(p => {
    if (typeof p === 'bigint') return Number(p);
    if (p === undefined) return null;
    return p as string | number | null;
  });
}

export const database: CoreDatabase = {
  async exec(sql: string): Promise<void> {
    const db = getDb();
    db.execSync(sql);
  },

  async run(sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number; changes: number }> {
    const db = getDb();
    const result = db.runSync(sql, convertParams(params));
    return {
      lastInsertRowid: result.lastInsertRowId ?? 0,
      changes: result.changes ?? 0,
    };
  },

  async get<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const db = getDb();
    const row = db.getFirstSync<T>(sql, convertParams(params));
    return row ?? undefined;
  },

  async all<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const db = getDb();
    return db.getAllSync<T>(sql, convertParams(params));
  },

  async close(): Promise<void> {
    if (dbInstance) {
      dbInstance.closeSync();
      dbInstance = null;
    }
  },
};

export default database;