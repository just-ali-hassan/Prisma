/**
 * Desktop KeyManager Implementation
 * 
 * Wraps Tauri keychain commands to implement the KeyManager interface.
 * Non-hook version for use during app initialization.
 */

import { invoke } from '@tauri-apps/api/core';
import type { KeyManager } from '@prisma-ai/core/security/key-manager';

const SERVICE_NAME = 'prisma-ai';

interface KeyResult {
  success: boolean;
  key?: string;
  error?: string;
}

export function createDesktopKeyManager(): KeyManager {
  return {
    async setKey(providerId: string, key: string): Promise<void> {
      const result = await invoke<{ success: boolean; error?: string }>('set_key', { 
        provider: providerId, 
        key 
      });
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to save key');
      }
    },

    async getKey(providerId: string): Promise<string | undefined> {
      const result = await invoke<{ success: boolean; key?: string; error?: string }>('get_key', { 
        provider: providerId 
      });
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to get key');
      }
      return result.key;
    },

    async deleteKey(providerId: string): Promise<void> {
      const result = await invoke<{ success: boolean; error?: string }>('delete_key', { 
        provider: providerId 
      });
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to delete key');
      }
    },

    async listKeys(): Promise<string[]> {
      return invoke<string[]>('list_keys');
    },

    async hasKey(providerId: string): Promise<boolean> {
      const key = await this.getKey(providerId);
      return !!key;
    },
  };
}