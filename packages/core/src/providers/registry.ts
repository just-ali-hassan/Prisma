/**
 * Provider Registry
 *
 * Maps provider IDs to adapter instances.
 * All adapters must be registered here to be available.
 */

import type { ProviderAdapter, ProviderId } from './types';

class ProviderRegistry {
  private adapters = new Map<ProviderId, ProviderAdapter>();

  /**
   * Register a provider adapter.
   * Called during app initialization.
   */
  register(adapter: ProviderAdapter): void {
    if (this.adapters.has(adapter.providerId)) {
      throw new Error(`Provider ${adapter.providerId} already registered`);
    }
    this.adapters.set(adapter.providerId, adapter);
  }

  /**
   * Get an adapter by provider ID.
   */
  get(providerId: ProviderId): ProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  /**
   * Get all registered provider IDs.
   */
  getRegisteredProviders(): ProviderId[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if a provider is registered.
   */
  has(providerId: ProviderId): boolean {
    return this.adapters.has(providerId);
  }

  /**
   * Get all registered adapters.
   */
  getAll(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Clear all adapters (for testing).
   */
  clear(): void {
    this.adapters.clear();
  }
}

/**
 * Singleton registry instance.
 * Adapters register themselves on import.
 */
export const providerRegistry = new ProviderRegistry();

/**
 * Helper to get an adapter or throw if not registered.
 */
export function getAdapter(providerId: ProviderId): ProviderAdapter {
  const adapter = providerRegistry.get(providerId);
  if (!adapter) {
    throw new Error(
      `Provider "${providerId}" is not registered. ` +
        `Available: ${providerRegistry.getRegisteredProviders().join(', ')}`
    );
  }
  return adapter;
}
