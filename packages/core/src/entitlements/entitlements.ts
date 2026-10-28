/**
 * Entitlements System
 *
 * Feature gating layer. Every advanced feature checks an entitlement.
 * At launch, all flags are enabled. When monetization arrives, flip flags here.
 */

import type { Database } from '../db/schema';

// Entitlement feature names
export type EntitlementFeature =
  'voice' | 'image_gen' | 'agents' | 'mcp' | 'skills' | 'plugins' | 'video_input';

// Default all enabled at launch
const DEFAULT_ENTITLEMENTS: Record<EntitlementFeature, boolean> = {
  voice: true,
  image_gen: true,
  agents: true,
  mcp: true,
  skills: true,
  plugins: true,
  video_input: true,
};

let entitlementsCache: Record<EntitlementFeature, boolean> | null = null;
let dbInstance: Database | null = null;

/**
 * Initialize entitlements from database.
 * Call on app startup.
 */
export async function initializeEntitlements(db: Database): Promise<void> {
  dbInstance = db;

  // Ensure all entitlements exist in DB
  for (const [feature, enabled] of Object.entries(DEFAULT_ENTITLEMENTS)) {
    await db.run('INSERT OR IGNORE INTO entitlements (feature, enabled) VALUES (?, ?)', [
      feature,
      Number(enabled),
    ]);
  }

  // Load into cache
  await refreshEntitlementsCache();
}

/**
 * Refresh the in-memory cache from database.
 */
export async function refreshEntitlementsCache(): Promise<void> {
  if (!dbInstance) return;

  const rows = await dbInstance.all<{ feature: string; enabled: number }>(
    'SELECT feature, enabled FROM entitlements'
  );

  entitlementsCache = { ...DEFAULT_ENTITLEMENTS };
  for (const row of rows) {
    if (row.feature in DEFAULT_ENTITLEMENTS) {
      entitlementsCache[row.feature as EntitlementFeature] = row.enabled === 1;
    }
  }
}

/**
 * Check if a feature is enabled.
 * Throws EntitlementError if disabled.
 */
export function checkEntitlement(feature: EntitlementFeature): void {
  if (!isEntitlementEnabled(feature)) {
    throw new EntitlementError(`${feature} is not enabled`, feature);
  }
}

/**
 * Check if a feature is enabled (boolean, no throw).
 */
export function isEntitlementEnabled(feature: EntitlementFeature): boolean {
  if (!entitlementsCache) {
    // If not initialized, default to enabled (fail open for safety)
    return DEFAULT_ENTITLEMENTS[feature] ?? false;
  }
  return entitlementsCache[feature] ?? DEFAULT_ENTITLEMENTS[feature] ?? false;
}

/**
 * Get all entitlements status.
 */
export function getAllEntitlements(): Record<EntitlementFeature, boolean> {
  return { ...(entitlementsCache ?? DEFAULT_ENTITLEMENTS) };
}

/**
 * Enable or disable an entitlement (admin/dev only).
 * Persists to database.
 */
export async function setEntitlement(feature: EntitlementFeature, enabled: boolean): Promise<void> {
  if (!dbInstance) throw new Error('Entitlements not initialized');

  await dbInstance.run('UPDATE entitlements SET enabled = ? WHERE feature = ?', [
    enabled ? 1 : 0,
    feature,
  ]);
  await refreshEntitlementsCache();
}

/**
 * Entitlement error class.
 */
export class EntitlementError extends Error {
  readonly code = 'ENTITLEMENT_DISABLED';
  constructor(
    message: string,
    public readonly feature: EntitlementFeature
  ) {
    super(message);
    this.name = 'EntitlementError';
  }
}

/**
 * React hook for checking entitlements in UI.
 * (Platform-specific implementation will wrap this)
 */
export function resetEntitlementsForTesting(): void {
  dbInstance = null;
  entitlementsCache = null;
}

export function createEntitlementChecker() {

  return {
    check: checkEntitlement,
    isEnabled: isEntitlementEnabled,
    getAll: getAllEntitlements,
    set: setEntitlement,
  };
}

/**
 * Decorator for gating methods with entitlements.
 * Usage: @requireEntitlement('agents') async myMethod() {}
 */
export function requireEntitlement(feature: EntitlementFeature) {
  return function (
    _target: object,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<(...args: unknown[]) => Promise<unknown>> | undefined
  ): TypedPropertyDescriptor<(...args: unknown[]) => Promise<unknown>> {
    // Handle case where descriptor is undefined (test environment)
    if (!descriptor?.value) {
      // Return a descriptor with a no-op function that checks entitlement
      return {
        value: function (..._args: unknown[]) {
          checkEntitlement(feature);
          // This would normally call the original method, but in test env there's none
          return Promise.resolve(undefined);
        },
        writable: true,
        configurable: true,
        enumerable: true,
      };
    }

    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: unknown[]) {
      checkEntitlement(feature);
      return originalMethod.apply(this, args);
    };
    return descriptor;
  };
}
