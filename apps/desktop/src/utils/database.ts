/**
 * Desktop Database Wrapper
 * 
 * Implements the core Database interface using tauri-plugin-sql.
 */

import { invoke } from '@tauri-apps/api/core';
import type { Database as CoreDatabase } from '@prisma-ai/core/db/schema';

interface TauriDbRow {
  [key: string]: unknown;
}

interface RunSqlResult {
  lastInsertRowid: number;
  changes: number;
}

function convertRow<T>(row: TauriDbRow): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

export const database: CoreDatabase = {
  async exec(sql: string): Promise<void> {
    await invoke('exec_sql', { sql });
  },

  async run(sql: string, params: unknown[] = []): Promise<{ lastInsertRowid: number; changes: number }> {
    const result = await invoke<RunSqlResult>('run_sql', { sql, params });
    return {
      lastInsertRowid: result.lastInsertRowid ?? 0,
      changes: result.changes ?? 0,
    };
  },

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await invoke<TauriDbRow[]>('select_sql', { sql, params });
    if (rows.length === 0) return undefined;
    return convertRow<T>(rows[0]);
  },

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const rows = await invoke<TauriDbRow[]>('select_sql', { sql, params });
    return rows.map(convertRow<T>);
  },

  async close(): Promise<void> {
    // No-op for Tauri SQL plugin
  },
};

export default database;