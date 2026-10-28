/**
 * Anthropic Adapter
 *
 * Implements the ProviderAdapter interface for Anthropic's API.
 * Supports streaming chat completions with tool calling.
 */

import type {
  ProviderAdapter,
  ProviderId,
  ModelId,
  ChatRequest,
  NormalizedMessage,
  StreamEvent,
  ToolCall,
  ModelInfo,
  ModelCapabilities,
  ModelPricing,
  TokenUsage,
} from '../types';
import { createMessageNormalizer } from '../../chat/message-normalizer';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderNetworkError,
  ProviderServerError,
  ProviderTimeoutError,
  ProviderCancelledError,
  ProviderMalformedStreamError,
} from '../types';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Combine multiple abort signals into a single signal.
 * Polyfill for AbortSignal.any which may not be available in all environments.
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', abort, { once: true });
  }

  // Clean up listeners when the controller is aborted
  controller.signal.addEventListener('abort', () => {
    for (const signal of signals) {
      signal.removeEventListener('abort', abort);
    }
  }, { once: true });

  return controller.signal;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | { type: 'text'; text: string }[];
  is_error?: boolean;
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicChatRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string } | { type: 'tool'; name: string };
  metadata?: Record<string, unknown>;
}

interface AnthropicStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop' | 'error';
  message?: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: AnthropicContentBlock[];
    model: string;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
    stop_sequence: string | null;
    usage: { input_tokens: number; output_tokens: number };
  };
  index?: number;
  delta?: {
    type: 'text_delta' | 'input_json_delta' | 'tool_use_delta';
    text?: string;
    partial_json?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  usage?: { input_tokens: number; output_tokens: number };
  error?: {
    type: string;
    message: string;
  };
}

interface AnthropicErrorResponse {
  error: {
    message: string;
    type: string;
  };
}

interface AnthropicModel {
  id: string;
  type: 'model';
  display_name: string;
  created_at: string;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerId: ProviderId = 'anthropic';
  readonly supportedModels: ModelId[] = [
    'claude-opus-5-5',
    'claude-sonnet-5-5',
    'claude-haiku-5-5',
  ];

  private apiKey: string | null = null;
  private abortController: AbortController | null = null;
  private messageNormalizer = createMessageNormalizer('anthropic');

  constructor(private keyManager: { getKey: (provider: string) => Promise<string | undefined> }) {}

  setApiKey(key: string): Promise<void> {
    this.apiKey = key;
    return Promise.resolve();
  }

  private async getApiKey(): Promise<string> {
    const key = (await this.keyManager.getKey('anthropic')) ?? this.apiKey;
    if (!key) {
      throw new ProviderAuthError('anthropic', 'Anthropic API key not configured');
    }
    return key;
  }

  async stream(
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const apiKey = await this.getApiKey();

    this.abortController = new AbortController();
    const combinedSignal = combineAbortSignals(signal, this.abortController.signal);

    const anthropicRequest = this.convertRequest(request);

    try {
      const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(anthropicRequest),
        signal: combinedSignal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new ProviderMalformedStreamError('anthropic', 'Response body is null');
      }

      await this.processStream(response.body, onEvent);
    } catch (error) {
      if (error instanceof ProviderAuthError ||
          error instanceof ProviderRateLimitError ||
          error instanceof ProviderNetworkError ||
          error instanceof ProviderServerError ||
          error instanceof ProviderTimeoutError ||
          error instanceof ProviderCancelledError ||
          error instanceof ProviderMalformedStreamError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ProviderCancelledError('anthropic');
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ProviderNetworkError('anthropic', 'Network request failed', error);
      }

      throw new ProviderNetworkError('anthropic', `Unexpected error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    } finally {
      this.abortController = null;
    }
  }

  async chat(request: ChatRequest, signal: AbortSignal): Promise<NormalizedMessage> {
    const apiKey = await this.getApiKey();

    this.abortController = new AbortController();
    const combinedSignal = combineAbortSignals(signal, this.abortController.signal);

    const anthropicRequest = this.convertRequest(request);
    anthropicRequest.stream = false;

    let result: NormalizedMessage;

    try {
      const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(anthropicRequest),
        signal: combinedSignal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      const data = await response.json() as {
        content: AnthropicContentBlock[];
        stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
        usage: { input_tokens: number; output_tokens: number };
      };
      result = this.convertResponse(data);
    } catch (error) {
      if (error instanceof ProviderAuthError ||
          error instanceof ProviderRateLimitError ||
          error instanceof ProviderNetworkError ||
          error instanceof ProviderServerError ||
          error instanceof ProviderTimeoutError ||
          error instanceof ProviderCancelledError ||
          error instanceof ProviderMalformedStreamError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ProviderCancelledError('anthropic');
      }

      throw new ProviderNetworkError('anthropic', `Unexpected error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    } finally {
      this.abortController = null;
    }

    return result!;
  }

  async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    const apiKey = await this.getApiKey();

    try {
      const response = await fetch(`${ANTHROPIC_API_BASE}/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        signal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as { data: AnthropicModel[] };
      return data.data
        .filter((m) => this.supportedModels.includes(m.id))
        .map((m) => ({
          id: m.id,
          provider: 'anthropic',
          name: m.display_name || m.id,
          contextWindow: this.getContextWindow(m.id),
          capabilities: this.getCapabilities(m.id),
          pricing: this.getPricing(m.id),
        }));
    } catch (error) {
      throw new ProviderNetworkError('anthropic', `Failed to list models: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  private convertRequest(request: ChatRequest): AnthropicChatRequest {
    const messages = request.messages
      .filter((m) => m.role !== 'system') // System prompt handled separately
      .map((msg) => this.convertMessage(msg));

    return {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages,
      system: request.systemPrompt,
      temperature: request.temperature ?? 0.7,
      top_p: request.topP,
      top_k: request.extra?.top_k as number | undefined,
      stream: request.stream ?? true,
      tools: request.tools?.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
      tool_choice: request.toolChoice ? this.convertToolChoice(request.toolChoice) : undefined,
    };
  }

  private convertToolChoice(choice: ChatRequest['toolChoice']): AnthropicChatRequest['tool_choice'] {
    if (choice === 'auto') {
      return { type: 'auto' };
    }
    if (choice === 'none') {
      // Anthropic doesn't support 'none', use 'auto' as fallback
      return { type: 'auto' };
    }
    if (typeof choice === 'object' && choice.type === 'function') {
      return { type: 'tool', name: choice.function.name };
    }
    return undefined;
  }

  private convertMessage(msg: NormalizedMessage): AnthropicMessage {
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolCallId!,
            content: msg.content ?? '',
            is_error: false,
          },
        ],
      };
    }

    const content: AnthropicContentBlock[] = [];

    if (msg.content) {
      content.push({ type: 'text', text: msg.content });
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    if (msg.attachments && msg.attachments.length > 0) {
      const imageAttachments = msg.attachments.filter((a) => a.type === 'image');
      for (const att of imageAttachments) {
        const base64Data = att.path.startsWith('data:')
          ? att.path.split(',')[1]
          : att.path;
        const mediaType = att.mimeType || 'image/png';
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Data,
          },
        });
      }
    }

    const finalContent: string | AnthropicContentBlock[] = content.length === 1 && content[0].type === 'text' && content[0].text
      ? content[0].text
      : (content.length > 0 ? content : '');
    return {
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: finalContent,
    };
  }

  private async processStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: StreamEvent) => void,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamUsage: TokenUsage | undefined;
    let hasEmittedDone = false;
    let currentToolCall: { id: string; name: string; arguments: string } | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed?.startsWith('data: ')) continue;

          const data = trimmed.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data) as AnthropicStreamEvent;

            switch (parsed.type) {
              case 'content_block_start': {
                // Handle both real API format (content_block) and test format (delta)
                const contentBlock = (parsed as { content_block?: { type: string; id?: string; name?: string } }).content_block ?? parsed.delta;
                if (contentBlock?.type === 'tool_use' && contentBlock.id && contentBlock.name) {
                  currentToolCall = {
                    id: contentBlock.id,
                    name: contentBlock.name,
                    arguments: '',
                  };
                }
                // For text blocks, we just need to track that we're in a text block
                break;
              }

              case 'content_block_delta': {
                if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
                  onEvent({ type: 'token', content: parsed.delta.text });
                } else if (parsed.delta?.type === 'input_json_delta' && parsed.delta.partial_json) {
                  if (currentToolCall) {
                    currentToolCall.arguments += parsed.delta.partial_json;
                  }
                }
                break;
              }

              case 'content_block_stop': {
                if (currentToolCall && currentToolCall.arguments) {
                  try {
                    JSON.parse(currentToolCall.arguments); // Validate JSON
                    onEvent({
                      type: 'tool_call',
                      toolCalls: [{
                        id: currentToolCall.id,
                        type: 'function',
                        function: {
                          name: currentToolCall.name,
                          arguments: currentToolCall.arguments,
                        },
                      }],
                    });
                  } catch {
                    // Invalid JSON, skip
                  }
                  currentToolCall = null;
                }
                break;
              }

              case 'message_delta': {
                if (parsed.usage) {
                  streamUsage = {
                    promptTokens: parsed.usage.input_tokens,
                    completionTokens: parsed.usage.output_tokens,
                    totalTokens: parsed.usage.input_tokens + parsed.usage.output_tokens,
                  };
                }
                break;
              }

              case 'message_stop': {
                if (!hasEmittedDone) {
                  hasEmittedDone = true;
                  onEvent({ type: 'done', usage: streamUsage });
                }
                break;
              }

              case 'error': {
                throw new ProviderServerError('anthropic', parsed.error?.message ?? 'Unknown error', 500);
              }
            }
          } catch (e) {
            // Re-throw ProviderServerError from error event, ignore other parse errors
            if (e instanceof ProviderServerError) throw e;
          }
        }
      }

      if (!hasEmittedDone) {
        hasEmittedDone = true;
        onEvent({ type: 'done', usage: streamUsage });
      }
    } finally {
      reader.releaseLock();
    }
  }

  private convertResponse(data: {
    content: AnthropicContentBlock[];
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
    usage: { input_tokens: number; output_tokens: number };
  }): NormalizedMessage {
    let content: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === 'text' && block.text) {
        content = block.text;
      } else if (block.type === 'tool_use' && block.id && block.name && block.input) {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      role: 'assistant',
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      extra: { usage: data.usage },
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const text = await response.text();
    let errorData: AnthropicErrorResponse;

    try {
      errorData = JSON.parse(text) as AnthropicErrorResponse;
    } catch {
      throw new ProviderServerError('anthropic', `HTTP ${response.status}: ${text}`, response.status);
    }

    const message = errorData.error?.message ?? `HTTP ${response.status}`;

    switch (response.status) {
      case 401:
        throw new ProviderAuthError('anthropic', message, response.status);
      case 429: {
        const retryAfter = response.headers.get('retry-after');
        throw new ProviderRateLimitError('anthropic', message, retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined, response.status);
      }
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ProviderServerError('anthropic', message, response.status);
      default:
        throw new ProviderServerError('anthropic', message, response.status);
    }
  }

  private getContextWindow(modelId: ModelId): number {
    return 1_000_000; // All Claude 5.5 models have 1M context
  }

  private getCapabilities(modelId: ModelId): ModelCapabilities {
    return {
      vision: true,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: true,
      streaming: true,
    };
  }

  private getPricing(modelId: ModelId): ModelPricing {
    const pricing: Record<string, ModelPricing> = {
      'claude-opus-5-5': { inputPerMillion: 4.0, outputPerMillion: 20.0 },
      'claude-sonnet-5-5': { inputPerMillion: 2.0, outputPerMillion: 10.0 },
      'claude-haiku-5-5': { inputPerMillion: 0.1, outputPerMillion: 0.5 },
    };
    return pricing[modelId] ?? { inputPerMillion: 0, outputPerMillion: 0 };
  }
}