/**
 * Key Manager Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { KeyManagerError, KeyNotFoundError, KeyStorageError } from '../key-manager';

describe('Key Manager Interface & Errors', () => {
  describe('KeyManagerError', () => {
    it('creates error with message and code', () => {
      const error = new KeyManagerError('Test error', 'TEST_CODE');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('KeyManagerError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('KeyNotFoundError', () => {
    it('creates error with provider ID', () => {
      const error = new KeyNotFoundError('openai');
      expect(error.message).toBe('API key not found for provider: openai');
      expect(error.code).toBe('KEY_NOT_FOUND');
      expect(error.name).toBe('KeyManagerError');
    });
  });

  describe('KeyStorageError', () => {
    it('creates error with message and code', () => {
      const error = new KeyStorageError('Storage failed');
      expect(error.message).toBe('Storage failed');
      expect(error.code).toBe('KEY_STORAGE_ERROR');
    });

    it('preserves original error as cause', () => {
      const original = new Error('Original error');
      const error = new KeyStorageError('Storage failed', original);
      expect(error.cause).toBe(original);
    });
  });
});