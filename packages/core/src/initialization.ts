/**
 * Core Initialization Module
 * 
 * Initializes all core subsystems (database, entitlements, providers)
 * during app startup. Called once per platform at startup.
 */

import type { KeyManager } from '@prisma-ai/core/security/key-manager';
import { initializeEntitlements } from '@prisma-ai/core/entitlements';
import { registerProviders } from '@prisma-ai/core/providers/adapters';
import { providerRegistry } from '@prisma-ai/core/providers/registry';
import type { Database } from '@prisma-ai/core/db/schema';

let initialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize all core subsystems.
 * Must be called exactly once during app startup.
 * Concurrent calls will share the same initialization promise.
 */
export async function initializeCore(
  db: Database,
  keyManager: KeyManager
): Promise<void> {
  // If already initialized, return immediately
  if (initialized) {
    console.warn('[Core] Already initialized, skipping');
    return;
  }

  // If initialization is in progress, wait for it to complete
  /* istanbul ignore next - hard to test concurrent initialization without race conditions */
  if (initializationPromise) {
    console.warn('[Core] Initialization in progress, waiting...');
    await initializationPromise;
    return;
  }

  // Start initialization
  initializationPromise = (async () => {
    try {
      // 1. Initialize database schema and migrations
      const { initializeDatabase } = await import('@prisma-ai/core/db/schema');
      await initializeDatabase(db);
      console.log('[Core] Database initialized');

      // 2. Initialize entitlements (loads from DB into cache)
      await initializeEntitlements(db);
      console.log('[Core] Entitlements initialized');

      // 3. Register all provider adapters with the key manager
      registerProviders(keyManager);
      console.log('[Core] Providers registered');

      initialized = true;
      console.log('[Core] Initialization complete');
    } catch (error) {
      console.error('[Core] Initialization failed:', error);
      initializationPromise = null; // Allow retry on failure
      throw error;
    }
  })();

  await initializationPromise;
}

/**
 * Check if core has been initialized.
 */
export function isCoreInitialized(): boolean {
  return initialized;
}

/**
 * Reset initialization state (for testing only).
 */
export function resetCoreInitialization(): void {
  initialized = false;
  initializationPromise = null;
  providerRegistry.clear();
}