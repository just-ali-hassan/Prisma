import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'prisma_ai_key_';

export async function setKey(providerId: string, key: string): Promise<void> {
  await SecureStore.setItemAsync(`${KEY_PREFIX}${providerId}`, key);
}

export async function getKey(providerId: string): Promise<string | null> {
  return SecureStore.getItemAsync(`${KEY_PREFIX}${providerId}`);
}

export async function deleteKey(providerId: string): Promise<void> {
  await SecureStore.deleteItemAsync(`${KEY_PREFIX}${providerId}`);
}

export async function listKeys(): Promise<string[]> {
  // SecureStore doesn't have a built-in way to list all keys
  // We'll return known provider IDs that might have keys
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
    const key = await getKey(provider);
    if (key) {
      keys.push(provider);
    }
  }
  return keys;
}

export function useTauriKeyManager() {
  return {
    setKey,
    getKey,
    deleteKey,
    listKeys,
  };
}