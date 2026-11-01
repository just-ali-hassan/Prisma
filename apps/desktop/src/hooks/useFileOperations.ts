/**
 * File Operations Hook
 *
 * Tauri-based file operations for desktop app.
 */

import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface FilePickResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface FileResult {
  success: boolean;
  content?: string;
  path?: string;
  error?: string;
}

export interface WriteFileRequest {
  path: string;
  content: string;
}

export function useFileOperations() {
  const [loading, setLoading] = useState(false);

  const pickFile = useCallback(async (): Promise<FilePickResult> => {
    setLoading(true);
    try {
      const result = await invoke<FilePickResult>('pick_file');
      return result;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const readFile = useCallback(async (path: string): Promise<FileResult> => {
    setLoading(true);
    try {
      const result = await invoke<FileResult>('read_file', { path });
      return result;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const writeFile = useCallback(async (request: WriteFileRequest): Promise<FileResult> => {
    setLoading(true);
    try {
      const result = await invoke<FileResult>('write_file', { request });
      return result;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    pickFile,
    readFile,
    writeFile,
    loading,
  };
}