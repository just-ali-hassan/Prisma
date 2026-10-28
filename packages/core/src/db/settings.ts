/**
 * Settings Store
 *
 * Key-value settings storage with typed accessors.
 */

import type { Database } from './schema';

export interface SettingsStore {
  get<T>(key: string, defaultValue: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<Record<string, string>>;
}

/**
 * Create a settings store backed by SQLite.
 */
export function createSettingsStore(db: Database): SettingsStore {
  return {
    async get<T>(key: string, defaultValue: T): Promise<T> {
      const row = await db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
        key,
      ]);
      if (!row) return defaultValue;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return defaultValue;
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      const serialized = JSON.stringify(value);
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, serialized]);
    },

    async delete(key: string): Promise<void> {
      await db.run('DELETE FROM settings WHERE key = ?', [key]);
    },

    async getAll(): Promise<Record<string, string>> {
      const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
  };
}

/**
 * Typed settings keys.
 */
export const SettingsKeys = {
  // UI
  THEME: 'theme', // 'light' | 'dark' | 'system'
  LANGUAGE: 'language',

  // Chat
  DEFAULT_MODEL: 'defaultModel',
  DEFAULT_PROVIDER: 'defaultProvider',
  DEFAULT_TEMPERATURE: 'defaultTemperature',
  DEFAULT_MAX_TOKENS: 'defaultMaxTokens',
  DEFAULT_TOP_P: 'defaultTopP',
  AUTO_SCROLL: 'autoScroll',
  STREAMING_ENABLED: 'streamingEnabled',

  // Voice
  VOICE_ENABLED: 'voiceEnabled',
  TTS_VOICE: 'ttsVoice',
  STT_LANGUAGE: 'sttLanguage',
  AUTO_PLAY_TTS: 'autoPlayTts',

  // Agent
  AGENT_MODE_ENABLED: 'agentModeEnabled',
  AUTO_APPROVE_READ_ONLY: 'autoApproveReadOnly',
  MAX_AGENT_STEPS: 'maxAgentSteps',

  // Privacy
  ANALYTICS_OPT_IN: 'analyticsOptIn',
  CRASH_REPORTING: 'crashReporting',

  // Mobile specific
  KEYBOARD_BEHAVIOR: 'keyboardBehavior',
  HAPTIC_FEEDBACK: 'hapticFeedback',

  // Desktop specific
  WINDOW_WIDTH: 'windowWidth',
  WINDOW_HEIGHT: 'windowHeight',
  MINIMIZE_TO_TRAY: 'minimizeToTray',
} as const;

/**
 * Default settings values.
 */
export const DefaultSettings = {
  [SettingsKeys.THEME]: 'system',
  [SettingsKeys.LANGUAGE]: 'en',
  [SettingsKeys.DEFAULT_TEMPERATURE]: 0.7,
  [SettingsKeys.DEFAULT_MAX_TOKENS]: 4096,
  [SettingsKeys.DEFAULT_TOP_P]: 1.0,
  [SettingsKeys.AUTO_SCROLL]: true,
  [SettingsKeys.STREAMING_ENABLED]: true,
  [SettingsKeys.VOICE_ENABLED]: true,
  [SettingsKeys.AUTO_PLAY_TTS]: false,
  [SettingsKeys.AGENT_MODE_ENABLED]: false,
  [SettingsKeys.AUTO_APPROVE_READ_ONLY]: true,
  [SettingsKeys.MAX_AGENT_STEPS]: 10,
  [SettingsKeys.ANALYTICS_OPT_IN]: false,
  [SettingsKeys.CRASH_REPORTING]: false,
  [SettingsKeys.KEYBOARD_BEHAVIOR]: 'default',
  [SettingsKeys.HAPTIC_FEEDBACK]: true,
  [SettingsKeys.WINDOW_WIDTH]: 1200,
  [SettingsKeys.WINDOW_HEIGHT]: 800,
  [SettingsKeys.MINIMIZE_TO_TRAY]: false,
} as const;
