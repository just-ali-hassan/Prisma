/**
 * Key Manager Interface
 *
 * Abstract interface for secure API key storage.
 * Platform apps provide the implementation.
 * Keys live in OS secure store (Keychain, Keystore, etc.)
 */

export interface KeyManager {
  /**
   * Store an API key for a provider.
   */
  setKey(providerId: string, key: string): Promise<void>;

  /**
   * Retrieve an API key for a provider.
   * Returns undefined if not set.
   */
  getKey(providerId: string): Promise<string | undefined>;

  /**
   * Delete an API key for a provider.
   */
  deleteKey(providerId: string): Promise<void>;

  /**
   * List all providers that have keys stored.
   */
  listKeys(): Promise<string[]>;

  /**
   * Check if a key exists for a provider.
   */
  hasKey(providerId: string): Promise<boolean>;
}

/**
 * Key Manager error classes
 */
export class KeyManagerError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'KeyManagerError';
  }
}

export class KeyNotFoundError extends KeyManagerError {
  constructor(providerId: string) {
    super(`API key not found for provider: ${providerId}`, 'KEY_NOT_FOUND');
  }
}

export class KeyStorageError extends KeyManagerError {
  constructor(message: string, originalError?: Error) {
    super(message, 'KEY_STORAGE_ERROR');
    this.cause = originalError;
  }
}
