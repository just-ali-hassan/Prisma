/**
 * Provider Adapter Types
 *
 * Defines the interface all provider adapters must implement.
 * Normalizes provider-specific formats into a common internal representation.
 */

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'xai'
  | 'nvidia'
  | 'openrouter'
  | 'omniroute'
  | 'groq'
  | 'together'
  | 'fireworks';

export type ModelId = string; // e.g., "gpt-4o", "claude-3-5-sonnet-20241022"

export type Role = 'user' | 'assistant' | 'system' | 'tool' | 'developer';

export interface NormalizedMessage {
  role: Role;
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string; // For tool result messages
  attachments?: Attachment[];
  modelId?: string; // Model that generated this (nullable for user msgs)
  tokenCount?: number; // Tokens used (nullable)
  cost?: number; // Estimated cost in USD (nullable)
  createdAt?: number; // Unix timestamp in ms
  extra?: Record<string, unknown>; // Provider-specific fields
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface Attachment {
  type: 'image' | 'file';
  path: string; // Local file path or base64 data URL
  mimeType: string;
  filename?: string;
}

export interface ChatRequest {
  messages: NormalizedMessage[];
  model: ModelId;
  provider: ProviderId;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream?: boolean;
  extra?: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export type StreamEventType = 'token' | 'done' | 'error' | 'tool_call' | 'tool_result';

export interface StreamEvent {
  type: StreamEventType;
  content?: string; // For token events
  toolCalls?: ToolCall[]; // For tool_call events
  toolResult?: ToolResult; // For tool_result events
  error?: Error; // For error events
  usage?: TokenUsage; // For done events
  extra?: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelInfo {
  id: ModelId;
  provider: ProviderId;
  name: string;
  contextWindow: number;
  capabilities: ModelCapabilities;
  pricing?: ModelPricing;
}

export interface ModelCapabilities {
  vision: boolean;
  video: boolean;
  imageGeneration: boolean;
  speechToText: boolean;
  textToSpeech: boolean;
  toolCalling: boolean;
  fileInput: boolean;
  streaming: boolean;
  reasoning?: boolean;
}

export interface ModelPricing {
  inputPerMillion: number; // USD
  outputPerMillion: number; // USD
  imageGenerationPerImage?: number; // USD
  audioInputPerSecond?: number; // USD
  audioOutputPerSecond?: number; // USD
}

export interface ProviderAdapter {
  readonly providerId: ProviderId;
  readonly supportedModels: ModelId[];

  /**
   * Stream a chat response from the provider.
   * @param request Normalized chat request
   * @param onEvent Callback for each stream event
   * @param signal AbortSignal for cancellation
   */
  stream(
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void,
    signal: AbortSignal
  ): Promise<void>;

  /**
   * Non-streaming chat completion (fallback for providers that don't support streaming).
   */
  chat(request: ChatRequest, signal: AbortSignal): Promise<NormalizedMessage>;

  /**
   * List available models for this provider.
   */
  listModels(signal: AbortSignal): Promise<ModelInfo[]>;

  /**
   * Cancel an in-progress request.
   */
  cancel(): void;

  /**
   * Generate an image (optional - only for providers that support it).
   */
  generateImage?(
    prompt: string,
    options: { model: ModelId; size?: string; quality?: string; n?: number },
    signal: AbortSignal
  ): Promise<{ urls: string[]; revisedPrompt?: string }>;

  /**
   * Speech to text (optional).
   */
  speechToText?(
    audioData: ArrayBuffer,
    options: { model: ModelId; language?: string },
    signal: AbortSignal
  ): Promise<string>;

  /**
   * Text to speech (optional).
   */
  textToSpeech?(
    text: string,
    options: { model: ModelId; voice?: string; format?: string },
    signal: AbortSignal
  ): Promise<ArrayBuffer>;

  /**
   * Generate embeddings (optional).
   */
  embed?(inputs: string[], options: { model: ModelId }, signal: AbortSignal): Promise<number[][]>;
}

// Error Classes
export abstract class ProviderError extends Error {
  abstract readonly code: string;
  constructor(
    message: string,
    public readonly providerId: ProviderId,
    public readonly modelId?: ModelId,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ProviderAuthError extends ProviderError {
  readonly code = 'PROVIDER_AUTH_FAILED';
  constructor(providerId: ProviderId, message: string, statusCode?: number) {
    super(message, providerId, undefined, statusCode);
  }
}

export class ProviderRateLimitError extends ProviderError {
  readonly code = 'PROVIDER_RATE_LIMIT';
  readonly retryAfter?: number;
  constructor(providerId: ProviderId, message: string, retryAfter?: number, statusCode?: number) {
    super(message, providerId, undefined, statusCode);
    this.retryAfter = retryAfter;
  }
}

export class ProviderNetworkError extends ProviderError {
  readonly code = 'PROVIDER_NETWORK_ERROR';
  constructor(providerId: ProviderId, message: string, originalError?: Error) {
    super(message, providerId);
    this.cause = originalError;
  }
}

export class ProviderServerError extends ProviderError {
  readonly code = 'PROVIDER_SERVER_ERROR';
  constructor(providerId: ProviderId, message: string, statusCode: number) {
    super(message, providerId, undefined, statusCode);
  }
}

export class ProviderUnsupportedFeatureError extends ProviderError {
  readonly code = 'PROVIDER_UNSUPPORTED_FEATURE';
  readonly feature: string;
  constructor(providerId: ProviderId, modelId: ModelId, feature: string) {
    super(`Model ${modelId} does not support ${feature}`, providerId, modelId);
    this.feature = feature;
  }
}

export class ProviderTimeoutError extends ProviderError {
  readonly code = 'PROVIDER_TIMEOUT';
  constructor(providerId: ProviderId, modelId?: ModelId) {
    super('Request timed out', providerId, modelId);
  }
}

export class ProviderCancelledError extends ProviderError {
  readonly code = 'PROVIDER_CANCELLED';
  constructor(providerId: ProviderId) {
    super('Request was cancelled', providerId);
  }
}

export class ProviderMalformedStreamError extends ProviderError {
  readonly code = 'PROVIDER_MALFORMED_STREAM';
  constructor(providerId: ProviderId, message: string) {
    super(`Malformed stream: ${message}`, providerId);
  }
}
