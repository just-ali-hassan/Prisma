/**
 * Capability Table Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MODEL_CAPABILITIES,
  getModelCapabilities,
  getModelsForProvider,
  modelSupports,
  getModelContextWindow,
  getModelPricing,
  estimateCost,
  isModelUsable,
  getUsableModels,
  validateCapabilityTableAgreement,
  assertCapabilityTableAgreement,
} from '../capability-table';
import { providerRegistry } from '../registry';
import { OpenAIAdapter } from '../adapters/openai.adapter';
import { AnthropicAdapter } from '../adapters/anthropic.adapter';
import { GoogleAdapter } from '../adapters/google.adapter';
import { DeepSeekAdapter } from '../adapters/deepseek.adapter';
import { XAIAdapter } from '../adapters/xai.adapter';
import { NVIDIAAdapter } from '../adapters/nvidia.adapter';
import { OpenRouterAdapter } from '../adapters/openrouter.adapter';
import { OmniRouteAdapter } from '../adapters/omniroute.adapter';
import { GroqAdapter } from '../adapters/groq.adapter';
import { TogetherAdapter } from '../adapters/together.adapter';
import { FireworksAdapter } from '../adapters/fireworks.adapter';
import type { ProviderId, ModelId, ProviderAdapter } from '../types';

describe('Capability Table', () => {
  describe('MODEL_CAPABILITIES', () => {
    it('contains at least one model per provider', () => {
      const providers = new Set(MODEL_CAPABILITIES.map(m => m.provider));
      expect(providers.has('openai')).toBe(true);
      expect(providers.has('anthropic')).toBe(true);
      expect(providers.has('google')).toBe(true);
      expect(providers.has('deepseek')).toBe(true);
      expect(providers.has('xai')).toBe(true);
      expect(providers.has('nvidia')).toBe(true);
      expect(providers.has('openrouter')).toBe(true);
      expect(providers.has('omniroute')).toBe(true);
      expect(providers.has('groq')).toBe(true);
      expect(providers.has('together')).toBe(true);
      expect(providers.has('fireworks')).toBe(true);
    });

    it('each model has required fields', () => {
      for (const model of MODEL_CAPABILITIES) {
        expect(model.id).toBeDefined();
        expect(model.provider).toBeDefined();
        expect(model.name).toBeDefined();
        expect(typeof model.contextWindow).toBe('number');
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.capabilities).toBeDefined();
        expect(typeof model.capabilities.vision).toBe('boolean');
        expect(typeof model.capabilities.video).toBe('boolean');
        expect(typeof model.capabilities.imageGeneration).toBe('boolean');
        expect(typeof model.capabilities.speechToText).toBe('boolean');
        expect(typeof model.capabilities.textToSpeech).toBe('boolean');
        expect(typeof model.capabilities.toolCalling).toBe('boolean');
        expect(typeof model.capabilities.fileInput).toBe('boolean');
        expect(typeof model.capabilities.streaming).toBe('boolean');
        expect(model.pricing).toBeDefined();
        expect(typeof model.pricing.inputPerMillion).toBe('number');
        expect(typeof model.pricing.outputPerMillion).toBe('number');
        expect(model.pricing.inputPerMillion).toBeGreaterThanOrEqual(0);
        expect(model.pricing.outputPerMillion).toBeGreaterThanOrEqual(0);
      }
    });

    it('has no duplicate model IDs within same provider', () => {
      const seen = new Set<string>();
      for (const model of MODEL_CAPABILITIES) {
        const key = `${model.provider}:${model.id}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });
  });

  describe('getModelCapabilities', () => {
    it('returns model entry for valid provider and model', () => {
      const result = getModelCapabilities('openai', 'gpt-4o');
      expect(result).toBeDefined();
      expect(result?.id).toBe('gpt-4o');
      expect(result?.provider).toBe('openai');
      expect(result?.name).toBe('GPT-4o');
    });

    it('returns undefined for unknown model', () => {
      const result = getModelCapabilities('openai', 'unknown-model');
      expect(result).toBeUndefined();
    });

    it('returns undefined for unknown provider', () => {
      const result = getModelCapabilities('unknown' as ProviderId, 'gpt-4o');
      expect(result).toBeUndefined();
    });
  });

  describe('getModelsForProvider', () => {
    it('returns all models for a provider', () => {
      const openaiModels = getModelsForProvider('openai');
      expect(openaiModels.length).toBeGreaterThan(0);
      expect(openaiModels.every(m => m.provider === 'openai')).toBe(true);
    });

    it('returns empty array for unknown provider', () => {
      const result = getModelsForProvider('unknown' as ProviderId);
      expect(result).toEqual([]);
    });
  });

  describe('modelSupports', () => {
    it('returns true when model supports capability', () => {
      expect(modelSupports('openai', 'gpt-4o', 'vision')).toBe(true);
      expect(modelSupports('openai', 'gpt-4o', 'toolCalling')).toBe(true);
      expect(modelSupports('google', 'gemini-1.5-flash', 'video')).toBe(true);
    });

    it('returns false when model does not support capability', () => {
      expect(modelSupports('openai', 'o1', 'vision')).toBe(false);
      expect(modelSupports('deepseek', 'deepseek-chat', 'vision')).toBe(false);
    });

    it('returns false for unknown model', () => {
      expect(modelSupports('openai', 'unknown', 'vision')).toBe(false);
    });

    it('returns false for unknown provider', () => {
      expect(modelSupports('unknown' as ProviderId, 'gpt-4o', 'vision')).toBe(false);
    });
  });

  describe('getModelContextWindow', () => {
    it('returns context window for known model', () => {
      expect(getModelContextWindow('openai', 'gpt-4o')).toBe(128_000);
      expect(getModelContextWindow('google', 'gemini-1.5-pro')).toBe(2_000_000);
    });

    it('returns default 4096 for unknown model', () => {
      expect(getModelContextWindow('openai', 'unknown')).toBe(4096);
    });
  });

  describe('getModelPricing', () => {
    it('returns pricing for known model', () => {
      const pricing = getModelPricing('openai', 'gpt-4o');
      expect(pricing).toEqual({ inputPerMillion: 2.5, outputPerMillion: 10.0 });
    });

    it('returns undefined for unknown model', () => {
      expect(getModelPricing('openai', 'unknown')).toBeUndefined();
    });
  });

  describe('estimateCost', () => {
    it('calculates cost correctly', () => {
      // gpt-4o: $2.5/M input, $10/M output
      // 1000 prompt tokens + 2000 completion tokens
      const cost = estimateCost('openai', 'gpt-4o', 1000, 2000);
      expect(cost).toBeCloseTo((1000/1_000_000)*2.5 + (2000/1_000_000)*10.0);
    });

    it('returns 0 for unknown model', () => {
      expect(estimateCost('openai', 'unknown', 1000, 2000)).toBe(0);
    });

    it('returns 0 for model without pricing', () => {
      expect(estimateCost('openrouter', 'openrouter:auto', 1000, 2000)).toBe(0);
    });

    it('handles zero tokens', () => {
      expect(estimateCost('openai', 'gpt-4o', 0, 0)).toBe(0);
    });
  });

  describe('isModelUsable and getUsableModels', () => {
    beforeEach(() => {
      providerRegistry.clear();
    });

    it('returns false when provider is not registered', () => {
      expect(isModelUsable('openai', 'gpt-4o')).toBe(false);
      expect(isModelUsable('unknown' as ProviderId, 'gpt-4o')).toBe(false);
    });

    it('returns true when provider is registered and adapter recognizes model', () => {
      const mockAdapter: ProviderAdapter = {
        providerId: 'openai',
        supportedModels: ['gpt-4o', 'gpt-4o-mini'],
        stream: vi.fn(),
        chat: vi.fn(),
        listModels: vi.fn(),
        cancel: vi.fn(),
      };
      providerRegistry.register(mockAdapter);

      expect(isModelUsable('openai', 'gpt-4o')).toBe(true);
      expect(isModelUsable('openai', 'gpt-4o-mini')).toBe(true);
    });

    it('returns false when provider is registered but adapter does not recognize model', () => {
      const mockAdapter: ProviderAdapter = {
        providerId: 'openai',
        supportedModels: ['gpt-4o'],
        stream: vi.fn(),
        chat: vi.fn(),
        listModels: vi.fn(),
        cancel: vi.fn(),
      };
      providerRegistry.register(mockAdapter);

      expect(isModelUsable('openai', 'unknown-model')).toBe(false);
    });

    it('getUsableModels returns empty when no providers are registered', () => {
      expect(getUsableModels()).toEqual([]);
    });

    it('getUsableModels returns only models whose adapter recognizes them', () => {
      const mockAdapter: ProviderAdapter = {
        providerId: 'google',
        supportedModels: ['gemini-1.5-flash'],
        stream: vi.fn(),
        chat: vi.fn(),
        listModels: vi.fn(),
        cancel: vi.fn(),
      };
      providerRegistry.register(mockAdapter);

      const usable = getUsableModels();
      expect(usable).toHaveLength(1);
      expect(usable[0].id).toBe('gemini-1.5-flash');
      expect(usable[0].provider).toBe('google');
    });
  });

  describe('validateCapabilityTableAgreement and assertCapabilityTableAgreement', () => {
    it('detects when capability table has a model missing from adapter supportedModels', () => {
      const incompleteAdapter: ProviderAdapter = {
        providerId: 'google',
        supportedModels: ['gemini-1.5-flash'], // missing gemini-1.5-pro
        stream: vi.fn(),
        chat: vi.fn(),
        listModels: vi.fn(),
        cancel: vi.fn(),
      };

      const result = validateCapabilityTableAgreement([incompleteAdapter]);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Provider "google" has model "gemini-1.5-pro" in capability-table.ts');

      expect(() => assertCapabilityTableAgreement([incompleteAdapter])).toThrow(
        /Capability table and adapter model mismatches detected/
      );
    });

    it('detects when adapter supports a model missing from capability table', () => {
      const extraAdapter: ProviderAdapter = {
        providerId: 'google',
        supportedModels: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-nonexistent' as ModelId],
        stream: vi.fn(),
        chat: vi.fn(),
        listModels: vi.fn(),
        cancel: vi.fn(),
      };

      const result = validateCapabilityTableAgreement([extraAdapter]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('gemini-nonexistent'))).toBe(true);
    });

    it('defaults to providerRegistry.getAll() when no adapters are passed', () => {
      providerRegistry.clear();
      const emptyResult = validateCapabilityTableAgreement();
      expect(emptyResult.valid).toBe(true);
      expect(emptyResult.errors).toEqual([]);
    });

    it('confirms that capability-table.ts and ALL 11 official provider adapters agree 100%', () => {
      const mockKeyManager = {
        getKey: vi.fn().mockResolvedValue('test-key'),
      };

      const allAdapters: ProviderAdapter[] = [
        new OpenAIAdapter(mockKeyManager),
        new AnthropicAdapter(mockKeyManager),
        new GoogleAdapter(mockKeyManager),
        new DeepSeekAdapter(mockKeyManager),
        new XAIAdapter(mockKeyManager),
        new NVIDIAAdapter(mockKeyManager),
        new OpenRouterAdapter(mockKeyManager),
        new OmniRouteAdapter(mockKeyManager),
        new GroqAdapter(mockKeyManager),
        new TogetherAdapter(mockKeyManager),
        new FireworksAdapter(mockKeyManager),
      ];

      const result = validateCapabilityTableAgreement(allAdapters);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
      expect(() => assertCapabilityTableAgreement(allAdapters)).not.toThrow();
    });
  });
});