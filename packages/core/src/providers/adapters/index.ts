/**
 * Provider Adapters Registration
 *
 * Provides registerProviders() to initialize and register all 11 provider adapters
 * with the key manager and validate capability table agreement.
 */

import { providerRegistry } from '../registry';
import { assertCapabilityTableAgreement } from '../capability-table';
import { OpenAIAdapter } from './openai.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { GoogleAdapter } from './google.adapter';
import { DeepSeekAdapter } from './deepseek.adapter';
import { XAIAdapter } from './xai.adapter';
import { NVIDIAAdapter } from './nvidia.adapter';
import { OpenRouterAdapter } from './openrouter.adapter';
import { OmniRouteAdapter } from './omniroute.adapter';
import { GroqAdapter } from './groq.adapter';
import { TogetherAdapter } from './together.adapter';
import { FireworksAdapter } from './fireworks.adapter';
import type { KeyManager } from '../../security/key-manager';

/**
 * Initialize all provider adapters with the key manager.
 * Call this during app startup.
 */
export function registerProviders(keyManager: KeyManager): void {
  // OpenAI
  const openaiAdapter = new OpenAIAdapter(keyManager);
  providerRegistry.register(openaiAdapter);

  // Anthropic
  const anthropicAdapter = new AnthropicAdapter(keyManager);
  providerRegistry.register(anthropicAdapter);

  // Google
  const googleAdapter = new GoogleAdapter(keyManager);
  providerRegistry.register(googleAdapter);

  // DeepSeek
  const deepseekAdapter = new DeepSeekAdapter(keyManager);
  providerRegistry.register(deepseekAdapter);

  // xAI
  const xaiAdapter = new XAIAdapter(keyManager);
  providerRegistry.register(xaiAdapter);

  // NVIDIA
  const nvidiaAdapter = new NVIDIAAdapter(keyManager);
  providerRegistry.register(nvidiaAdapter);

  // OpenRouter
  const openRouterAdapter = new OpenRouterAdapter(keyManager);
  providerRegistry.register(openRouterAdapter);

  // OmniRoute
  const omniRouteAdapter = new OmniRouteAdapter(keyManager);
  providerRegistry.register(omniRouteAdapter);

  // Groq
  const groqAdapter = new GroqAdapter(keyManager);
  providerRegistry.register(groqAdapter);

  // Together AI
  const togetherAdapter = new TogetherAdapter(keyManager);
  providerRegistry.register(togetherAdapter);

  // Fireworks AI
  const fireworksAdapter = new FireworksAdapter(keyManager);
  providerRegistry.register(fireworksAdapter);

  // Validate agreement between capability table and registered adapters
  assertCapabilityTableAgreement();
}

/**
 * Get the OpenAI adapter instance (for testing or direct access).
 */
export function getOpenAIAdapter(): OpenAIAdapter | undefined {
  return providerRegistry.get('openai') as OpenAIAdapter | undefined;
}

/**
 * Get the Anthropic adapter instance (for testing or direct access).
 */
export function getAnthropicAdapter(): AnthropicAdapter | undefined {
  return providerRegistry.get('anthropic') as AnthropicAdapter | undefined;
}

/**
 * Get the Google adapter instance (for testing or direct access).
 */
export function getGoogleAdapter(): GoogleAdapter | undefined {
  return providerRegistry.get('google') as GoogleAdapter | undefined;
}

/**
 * Get the DeepSeek adapter instance (for testing or direct access).
 */
export function getDeepSeekAdapter(): DeepSeekAdapter | undefined {
  return providerRegistry.get('deepseek') as DeepSeekAdapter | undefined;
}

/**
 * Get the xAI adapter instance (for testing or direct access).
 */
export function getXAIAdapter(): XAIAdapter | undefined {
  return providerRegistry.get('xai') as XAIAdapter | undefined;
}

/**
 * Get the NVIDIA adapter instance (for testing or direct access).
 */
export function getNVIDIAAdapter(): NVIDIAAdapter | undefined {
  return providerRegistry.get('nvidia') as NVIDIAAdapter | undefined;
}

/**
 * Get the OpenRouter adapter instance (for testing or direct access).
 */
export function getOpenRouterAdapter(): OpenRouterAdapter | undefined {
  return providerRegistry.get('openrouter') as OpenRouterAdapter | undefined;
}

/**
 * Get the OmniRoute adapter instance (for testing or direct access).
 */
export function getOmniRouteAdapter(): OmniRouteAdapter | undefined {
  return providerRegistry.get('omniroute') as OmniRouteAdapter | undefined;
}

/**
 * Get the Groq adapter instance (for testing or direct access).
 */
export function getGroqAdapter(): GroqAdapter | undefined {
  return providerRegistry.get('groq') as GroqAdapter | undefined;
}

/**
 * Get the Together AI adapter instance (for testing or direct access).
 */
export function getTogetherAdapter(): TogetherAdapter | undefined {
  return providerRegistry.get('together') as TogetherAdapter | undefined;
}

/**
 * Get the Fireworks AI adapter instance (for testing or direct access).
 */
export function getFireworksAdapter(): FireworksAdapter | undefined {
  return providerRegistry.get('fireworks') as FireworksAdapter | undefined;
}