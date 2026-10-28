/**
 * Capability Table
 *
 * Single source of truth for model capabilities.
 * UI reads this table to show/hide features.
 * Never assume a model supports a feature — always check this table.
 */

import type { ModelId, ProviderId, ModelCapabilities, ModelPricing, ProviderAdapter } from './types';
import { providerRegistry } from './registry';

export interface ModelEntry {
  id: ModelId;
  provider: ProviderId;
  name: string;
  contextWindow: number;
  capabilities: ModelCapabilities;
  pricing: ModelPricing;
}

/**
 * All supported models with their capabilities and pricing.
 * Keep this updated as providers release new models.
 */
export const MODEL_CAPABILITIES: ModelEntry[] = [
  // OpenAI
  {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    contextWindow: 128_000,
    capabilities: {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 2.5,
      outputPerMillion: 10.0,
    },
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o mini',
    contextWindow: 128_000,
    capabilities: {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.15,
      outputPerMillion: 0.6,
    },
  },
  {
    id: 'gpt-4.5',
    provider: 'openai',
    name: 'GPT-4.5',
    contextWindow: 128_000,
    capabilities: {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 75.0,
      outputPerMillion: 150.0,
    },
  },
  {
    id: 'o1',
    provider: 'openai',
    name: 'o1',
    contextWindow: 200_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: false,
    },
    pricing: {
      inputPerMillion: 15.0,
      outputPerMillion: 60.0,
    },
  },
  {
    id: 'o3',
    provider: 'openai',
    name: 'o3',
    contextWindow: 200_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: false,
    },
    pricing: {
      inputPerMillion: 15.0,
      outputPerMillion: 60.0,
    },
  },
  {
    id: 'o4-mini',
    provider: 'openai',
    name: 'o4-mini',
    contextWindow: 200_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: false,
    },
    pricing: {
      inputPerMillion: 1.1,
      outputPerMillion: 4.4,
    },
  },

  // Anthropic
  {
    id: 'claude-opus-5-5',
    provider: 'anthropic',
    name: 'Claude Opus 5.5',
    contextWindow: 1_000_000,
    capabilities: {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 4.0,
      outputPerMillion: 20.0,
    },
  },
  {
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    name: 'Claude Sonnet 5.5',
    contextWindow: 1_000_000,
    capabilities: {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 2.0,
      outputPerMillion: 10.0,
    },
  },
  {
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    name: 'Claude Haiku 5.5',
    contextWindow: 1_000_000,
    capabilities: {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.1,
      outputPerMillion: 0.5,
    },
  },

  // Google Gemini
  {
    id: 'gemini-1.5-flash',
    provider: 'google',
    name: 'Gemini 1.5 Flash',
    contextWindow: 1_000_000,
    capabilities: {
      vision: true,
      video: true,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.075,
      outputPerMillion: 0.3,
    },
  },
  {
    id: 'gemini-1.5-pro',
    provider: 'google',
    name: 'Gemini 1.5 Pro',
    contextWindow: 2_000_000,
    capabilities: {
      vision: true,
      video: true,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 1.25,
      outputPerMillion: 5.0,
    },
  },

  // DeepSeek
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    name: 'DeepSeek Chat',
    contextWindow: 128_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.14,
      outputPerMillion: 0.28,
    },
  },
  {
    id: 'deepseek-reasoner',
    provider: 'deepseek',
    name: 'DeepSeek Reasoner',
    contextWindow: 128_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.55,
      outputPerMillion: 2.19,
    },
  },

  // xAI
  {
    id: 'grok-3',
    provider: 'xai',
    name: 'Grok 3',
    contextWindow: 131_072,
    capabilities: {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 3.0,
      outputPerMillion: 15.0,
    },
  },
  {
    id: 'grok-3-mini',
    provider: 'xai',
    name: 'Grok 3 Mini',
    contextWindow: 131_072,
    capabilities: {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.3,
      outputPerMillion: 1.5,
    },
  },

  // NVIDIA NIM
  {
    id: 'nemotron-3-ultra',
    provider: 'nvidia',
    name: 'Nemotron 3 Ultra',
    contextWindow: 128_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.0,
      outputPerMillion: 0.0,
    },
  },

  // Gateway providers (models vary - these are examples)
  {
    id: 'openrouter:auto',
    provider: 'openrouter',
    name: 'OpenRouter (Auto)',
    contextWindow: 128_000,
    capabilities: {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.0,
      outputPerMillion: 0.0,
    },
  },
  {
    id: 'omniroute:auto',
    provider: 'omniroute',
    name: 'OmniRoute (Auto)',
    contextWindow: 128_000,
    capabilities: {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.0,
      outputPerMillion: 0.0,
    },
  },

  // Open-source inference APIs
  {
    id: 'llama-3.1-405b',
    provider: 'groq',
    name: 'Llama 3.1 405B',
    contextWindow: 131_072,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.59,
      outputPerMillion: 0.79,
    },
  },
  {
    id: 'llama-3.1-70b',
    provider: 'groq',
    name: 'Llama 3.1 70B',
    contextWindow: 131_072,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.09,
      outputPerMillion: 0.09,
    },
  },
  {
    id: 'llama-3.1-8b',
    provider: 'groq',
    name: 'Llama 3.1 8B',
    contextWindow: 131_072,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.05,
      outputPerMillion: 0.05,
    },
  },
  {
    id: 'mixtral-8x7b',
    provider: 'together',
    name: 'Mixtral 8x7B',
    contextWindow: 32_768,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.06,
      outputPerMillion: 0.06,
    },
  },
  {
    id: 'llama-3.1-405b',
    provider: 'together',
    name: 'Llama 3.1 405B',
    contextWindow: 128_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 1.8,
      outputPerMillion: 1.8,
    },
  },
  {
    id: 'llama-3.1-70b',
    provider: 'together',
    name: 'Llama 3.1 70B',
    contextWindow: 128_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.4,
      outputPerMillion: 0.4,
    },
  },
  {
    id: 'llama-3.1-8b',
    provider: 'together',
    name: 'Llama 3.1 8B',
    contextWindow: 128_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.1,
      outputPerMillion: 0.1,
    },
  },

  // Fireworks AI (additional models from Fireworks adapter)
  {
    id: 'llama-v3p1-405b-instruct',
    provider: 'fireworks',
    name: 'Llama 3.1 405B Instruct',
    contextWindow: 128_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 1.2,
      outputPerMillion: 1.2,
    },
  },
  {
    id: 'llama-v3p1-70b-instruct',
    provider: 'fireworks',
    name: 'Llama 3.1 70B Instruct',
    contextWindow: 128_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.2,
      outputPerMillion: 0.2,
    },
  },
  {
    id: 'llama-v3p1-8b-instruct',
    provider: 'fireworks',
    name: 'Llama 3.1 8B Instruct',
    contextWindow: 128_000,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.04,
      outputPerMillion: 0.04,
    },
  },
  {
    id: 'mixtral-8x7b-instruct',
    provider: 'fireworks',
    name: 'Mixtral 8x7B Instruct',
    contextWindow: 32_768,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.06,
      outputPerMillion: 0.06,
    },
  },
  {
    id: 'qwen2p5-72b-instruct',
    provider: 'fireworks',
    name: 'Qwen 2.5 72B Instruct',
    contextWindow: 131_072,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.3,
      outputPerMillion: 0.3,
    },
  },
  {
    id: 'qwen2p5-coder-32b-instruct',
    provider: 'fireworks',
    name: 'Qwen 2.5 Coder 32B Instruct',
    contextWindow: 131_072,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.15,
      outputPerMillion: 0.15,
    },
  },
  {
    id: 'deepseek-r1',
    provider: 'fireworks',
    name: 'DeepSeek R1',
    contextWindow: 131_072,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
      reasoning: true,
    },
    pricing: {
      inputPerMillion: 0.14,
      outputPerMillion: 2.19,
    },
  },
  {
    id: 'deepseek-v3',
    provider: 'fireworks',
    name: 'DeepSeek V3',
    contextWindow: 131_072,
    capabilities: {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    },
    pricing: {
      inputPerMillion: 0.14,
      outputPerMillion: 0.28,
    },
  },
];

/**
 * Get capability entry for a specific model.
 */
export function getModelCapabilities(
  provider: ProviderId,
  modelId: ModelId
): ModelEntry | undefined {
  return MODEL_CAPABILITIES.find((m) => m.provider === provider && m.id === modelId);
}

/**
 * Get all models for a provider.
 */
export function getModelsForProvider(provider: ProviderId): ModelEntry[] {
  return MODEL_CAPABILITIES.filter((m) => m.provider === provider);
}

/**
 * Check if a model supports a specific capability.
 */
export function modelSupports(
  provider: ProviderId,
  modelId: ModelId,
  capability: keyof ModelCapabilities
): boolean {
  const entry = getModelCapabilities(provider, modelId);
  return entry?.capabilities[capability] ?? false;
}

/**
 * Get the maximum context window for a model.
 */
export function getModelContextWindow(provider: ProviderId, modelId: ModelId): number {
  return getModelCapabilities(provider, modelId)?.contextWindow ?? 4096;
}

/**
 * Get pricing for a model.
 */
export function getModelPricing(provider: ProviderId, modelId: ModelId): ModelPricing | undefined {
  return getModelCapabilities(provider, modelId)?.pricing;
}

/**
 * Estimate cost for a request based on token usage.
 */
export function estimateCost(
  provider: ProviderId,
  modelId: ModelId,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = getModelPricing(provider, modelId);
  if (!pricing) return 0;

  const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}

/**
 * Check if a model can be used by the application.
 * A model is usable if and only if its provider is registered in providerRegistry
 * and the provider's adapter recognizes that exact model name in supportedModels.
 */
export function isModelUsable(provider: ProviderId | string, modelId: ModelId | string): boolean {
  const adapter = providerRegistry.get(provider as ProviderId);
  if (!adapter) {
    return false;
  }
  return adapter.supportedModels.includes(modelId as ModelId);
}

/**
 * Returns all models from the capability table that can currently be used by the app
 * (their provider is registered and the adapter recognizes the exact model name).
 */
export function getUsableModels(): ModelEntry[] {
  return MODEL_CAPABILITIES.filter((model) => isModelUsable(model.provider, model.id));
}

/**
 * Validation result for capability table and adapter agreement.
 */
export interface AgreementValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates that the capability table in capability-table.ts and adapter supportedModels agree.
 * Checks:
 * 1. Every model in the capability table for a provider is in that adapter's supportedModels.
 * 2. Every model in the adapter's supportedModels is present in the capability table for that provider.
 * 
 * @param adapters Optional array of adapters to check. Defaults to all registered adapters in providerRegistry.
 */
export function validateCapabilityTableAgreement(adapters?: ProviderAdapter[]): AgreementValidationResult {
  const targetAdapters = adapters ?? providerRegistry.getAll();
  const errors: string[] = [];

  for (const adapter of targetAdapters) {
    const tableModels = getModelsForProvider(adapter.providerId).map((m) => m.id);
    const adapterModels = adapter.supportedModels;

    // Check for models in capability table not supported by adapter
    for (const tableModel of tableModels) {
      if (!adapterModels.includes(tableModel)) {
        errors.push(
          `Provider "${adapter.providerId}" has model "${tableModel}" in capability-table.ts, but it is not in adapter supportedModels`
        );
      }
    }

    // Check for models in adapter supportedModels not in capability table
    for (const adapterModel of adapterModels) {
      if (!tableModels.includes(adapterModel)) {
        errors.push(
          `Adapter "${adapter.providerId}" supports model "${adapterModel}", but it is missing from capability-table.ts`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Asserts that the capability table and adapter supportedModels lists agree.
 * Throws an Error detailing any mismatches if found.
 */
export function assertCapabilityTableAgreement(adapters?: ProviderAdapter[]): void {
  const result = validateCapabilityTableAgreement(adapters);
  if (!result.valid) {
    throw new Error(
      `Capability table and adapter model mismatches detected:\n${result.errors.join('\n')}`
    );
  }
}

