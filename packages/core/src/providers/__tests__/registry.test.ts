/**
 * Provider Registry Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { providerRegistry, getAdapter } from '../registry';
import type { ProviderAdapter, ProviderId } from '../types';

// Mock adapter
const createMockAdapter = (id: ProviderId): ProviderAdapter => ({
  providerId: id,
  supportedModels: ['model-1'],
  stream: vi.fn(),
  chat: vi.fn(),
  listModels: vi.fn(),
  cancel: vi.fn(),
});

describe('Provider Registry', () => {
  beforeEach(() => {
    providerRegistry.clear();
  });

  describe('register', () => {
    it('registers a provider adapter', () => {
      const adapter = createMockAdapter('openai');
      providerRegistry.register(adapter);
      expect(providerRegistry.has('openai')).toBe(true);
    });

    it('throws if provider already registered', () => {
      const adapter = createMockAdapter('openai');
      providerRegistry.register(adapter);
      expect(() => providerRegistry.register(adapter)).toThrow('Provider openai already registered');
    });

    it('allows multiple different providers', () => {
      providerRegistry.register(createMockAdapter('openai'));
      providerRegistry.register(createMockAdapter('anthropic'));
      providerRegistry.register(createMockAdapter('google'));
      expect(providerRegistry.getRegisteredProviders()).toHaveLength(3);
    });
  });

  describe('get', () => {
    it('returns registered adapter', () => {
      const adapter = createMockAdapter('openai');
      providerRegistry.register(adapter);
      expect(providerRegistry.get('openai')).toBe(adapter);
    });

    it('returns undefined for unregistered provider', () => {
      expect(providerRegistry.get('unknown')).toBeUndefined();
    });
  });

  describe('getRegisteredProviders', () => {
    it('returns empty array when no providers', () => {
      expect(providerRegistry.getRegisteredProviders()).toEqual([]);
    });

    it('returns all registered provider IDs', () => {
      providerRegistry.register(createMockAdapter('openai'));
      providerRegistry.register(createMockAdapter('anthropic'));
      expect(providerRegistry.getRegisteredProviders()).toEqual(['openai', 'anthropic']);
    });
  });

  describe('has', () => {
    it('returns true for registered provider', () => {
      providerRegistry.register(createMockAdapter('openai'));
      expect(providerRegistry.has('openai')).toBe(true);
    });

    it('returns false for unregistered provider', () => {
      expect(providerRegistry.has('unknown')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns all registered adapters', () => {
      const adapter1 = createMockAdapter('openai');
      const adapter2 = createMockAdapter('anthropic');
      providerRegistry.register(adapter1);
      providerRegistry.register(adapter2);
      expect(providerRegistry.getAll()).toEqual([adapter1, adapter2]);
    });
  });

  describe('clear', () => {
    it('removes all providers', () => {
      providerRegistry.register(createMockAdapter('openai'));
      providerRegistry.clear();
      expect(providerRegistry.getRegisteredProviders()).toEqual([]);
      expect(providerRegistry.has('openai')).toBe(false);
    });
  });

  describe('getAdapter', () => {
    it('returns adapter when registered', () => {
      const adapter = createMockAdapter('openai');
      providerRegistry.register(adapter);
      expect(getAdapter('openai')).toBe(adapter);
    });

    it('throws with helpful message when not registered', () => {
      providerRegistry.register(createMockAdapter('openai'));
      expect(() => getAdapter('unknown')).toThrow(
        'Provider "unknown" is not registered. Available: openai'
      );
    });
  });
});