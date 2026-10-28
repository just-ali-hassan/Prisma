import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const SERVICE_NAME = 'prisma-ai';

interface KeyResult {
  success: boolean;
  key?: string;
  error?: string;
}

export function useTauriKeyManager() {
  const [loading, setLoading] = useState(false);

  const setKey = useCallback(async (provider: string, key: string): Promise<void> => {
    setLoading(true);
    try {
      const result = await invoke<KeyResult>('set_key', { provider, key });
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to save key');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const getKey = useCallback(async (provider: string): Promise<string | undefined> => {
    setLoading(true);
    try {
      const result = await invoke<KeyResult>('get_key', { provider });
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to get key');
      }
      return result.key;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteKey = useCallback(async (provider: string): Promise<void> => {
    setLoading(true);
    try {
      const result = await invoke<KeyResult>('delete_key', { provider });
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to delete key');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const listKeys = useCallback(async (): Promise<string[]> => {
    setLoading(true);
    try {
      return await invoke<string[]>('list_keys');
    } finally {
      setLoading(false);
    }
  }, []);

  const hasKey = useCallback(async (provider: string): Promise<boolean> => {
    const key = await getKey(provider);
    return !!key;
  }, [getKey]);

  return {
    setKey,
    getKey,
    deleteKey,
    listKeys,
    hasKey,
    loading,
  };
}