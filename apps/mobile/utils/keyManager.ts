/**
 * Mobile KeyManager Implementation
 * 
 * Wraps Expo SecureStore to implement the KeyManager interface.
 * Non-hook version for use during app initialization.
 */

import * as SecureStore from 'expo-secure-store';
import type { KeyManager } from '@prisma-ai/core/security/key-manager';

const KEY_PREFIX = 'prisma_ai_key_';

export function createMobileKeyManager(): KeyManager {
  return {
    async setKey(providerId: string, key: string): Promise<void> {
      await SecureStore.setItemAsync(`${KEY_PREFIX}${providerId}`, key);
    },

    async getKey(providerId: string): Promise<string | undefined> {
      const key = await SecureStore.getItemAsync(`${KEY_PREFIX}${providerId}`);
      return key ?? undefined;
    },

    async deleteKey(providerId: string): Promise<void> {
      await SecureStore.deleteItemAsync(`${KEY_PREFIX}${providerId}`);
    },

    async listKeys(): Promise<string[]> {
      const providers = [
        'openai',
        'anthropic',
        'google',
        'deepseek',
        'xai',
        'nvidia',
        'openrouter',
        'omniroute',
        'groq',
        'together',
        'fireworks',
      ];

      const keys: string[] = [];
      for (const provider of providers) {
        const key = await SecureStore.getItemAsync(`${KEY_PREFIX}${provider}`);
        if (key) {
          keys.push(provider);
        }
      }
      return keys;
    },

    async hasKey(providerId: string): Promise<boolean> {
      const key = await SecureStore.getItemAsync(`${KEY_PREFIX}${providerId}`);
      return !!key;
    },
  };
}