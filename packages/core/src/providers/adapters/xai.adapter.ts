/**
 * xAI (Grok) Adapter
 *
 * Implements the ProviderAdapter interface for xAI's API.
 * xAI uses OpenAI-compatible API format.
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

const XAI_API_BASE = 'https://api.x.ai/v1';

/**
 * Combine multiple abort signals into a single signal.
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

  controller.signal.addEventListener('abort', () => {
    for (const signal of signals) {
      signal.removeEventListener('abort', abort);
    }
  }, { once: true });

  return controller.signal;
}

interface XAIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string | null;
  tool_calls?: XAIToolCall[];
  tool_call_id?: string;
}

interface XAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface XAIChatRequest {
  model: string;
  messages: XAIMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  tools?: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface XAIStreamResponse {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      content?: string;
      tool_calls?: {
        index: number;
        id?: string;
        type: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
      role?: string;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface XAIErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

interface XAIModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export class XAIAdapter implements ProviderAdapter {
  readonly providerId: ProviderId = 'xai';
  readonly supportedModels: ModelId[] = [
    'grok-3',
    'grok-3-mini',
  ];

  private apiKey: string | null = null;
  private abortController: AbortController | null = null;
  private messageNormalizer = createMessageNormalizer('xai');

  constructor(private keyManager: { getKey: (provider: string) => Promise<string | undefined> }) {}

  setApiKey(key: string): Promise<void> {
    this.apiKey = key;
    return Promise.resolve();
  }

  private async getApiKey(): Promise<string> {
    const key = (await this.keyManager.getKey('xai')) ?? this.apiKey;
    if (!key) {
      throw new ProviderAuthError('xai', 'xAI API key not configured');
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

    const xaiRequest = this.convertRequest(request);

    try {
      const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(xaiRequest),
        signal: combinedSignal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new ProviderMalformedStreamError('xai', 'Response body is null');
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
        throw new ProviderCancelledError('xai');
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ProviderNetworkError('xai', 'Network request failed', error);
      }

      throw new ProviderNetworkError('xai', `Unexpected error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    } finally {
      this.abortController = null;
    }
  }

  async chat(request: ChatRequest, signal: AbortSignal): Promise<NormalizedMessage> {
    const apiKey = await this.getApiKey();

    this.abortController = new AbortController();
    const combinedSignal = combineAbortSignals(signal, this.abortController.signal);

    const xaiRequest = this.convertRequest(request);
    xaiRequest.stream = false;

    let result: NormalizedMessage;

    try {
      const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(xaiRequest),
        signal: combinedSignal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as {
        choices: { message: XAIMessage }[];
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
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
        throw new ProviderCancelledError('xai');
      }

      throw new ProviderNetworkError('xai', `Unexpected error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    } finally {
      this.abortController = null;
    }

    return result!;
  }

  async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    const apiKey = await this.getApiKey();

    try {
      const response = await fetch(`${XAI_API_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as { data: XAIModel[] };
      return data.data
        .filter((m) => this.supportedModels.includes(m.id))
        .map((m) => ({
          id: m.id,
          provider: 'xai',
          name: m.id,
          contextWindow: this.getContextWindow(m.id),
          capabilities: this.getCapabilities(m.id),
          pricing: this.getPricing(m.id),
        }));
    } catch (error) {
      throw new ProviderNetworkError('xai', `Failed to list models: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  private convertRequest(request: ChatRequest): XAIChatRequest {
    const messages = request.messages.map((msg) => this.convertMessage(msg));
    if (request.systemPrompt) {
      messages.unshift({ role: 'system', content: request.systemPrompt });
    }

    return {
      model: request.model,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      frequency_penalty: request.frequencyPenalty,
      presence_penalty: request.presencePenalty,
      stream: request.stream ?? true,
      stream_options: request.stream !== false ? { include_usage: true } : undefined,
      tools: request.tools,
      tool_choice: request.toolChoice,
    };
  }

  private convertMessage(msg: NormalizedMessage): XAIMessage {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content ?? '',
        tool_call_id: msg.toolCallId!,
      };
    }

    const xaiMsg: XAIMessage = {
      role: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system',
      content: msg.content ?? undefined,
    };

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      xaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));
    }

    // xAI doesn't support native image input, but we can include as text description
    if (msg.attachments && msg.attachments.length > 0) {
      const imageAttachments = msg.attachments.filter((a) => a.type === 'image');
      if (imageAttachments.length > 0) {
        const imageDescriptions = imageAttachments.map((att) =>
          `[Image: ${att.filename || att.path} (${att.mimeType})]`
        ).join('\n');
        xaiMsg.content = (xaiMsg.content ?? '') + '\n\n' + imageDescriptions;
      }
    }

    return xaiMsg;
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
          if (data === '[DONE]') {
            if (!hasEmittedDone) {
              hasEmittedDone = true;
              onEvent({ type: 'done', usage: streamUsage });
            }
            return;
          }

          try {
            const parsed = JSON.parse(data) as XAIStreamResponse;
            if (parsed.usage) {
              streamUsage = {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              };
            }
            const events = this.parseStreamChunk(parsed);
            for (const event of events) {
              if (event.type !== 'done') onEvent(event);
            }
          } catch {
            // Ignore parse errors for malformed chunks
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

  private parseStreamChunk(data: XAIStreamResponse): StreamEvent[] {
    const events: StreamEvent[] = [];
    const choice = data.choices[0];
    if (!choice) return events;

    // Token delta
    if (choice.delta.content) {
      events.push({
        type: 'token',
        content: choice.delta.content,
      });
    }

    // Tool calls
    if (choice.delta.tool_calls && choice.delta.tool_calls.length > 0) {
      const toolCalls = this.parseToolCalls(choice.delta.tool_calls);
      if (toolCalls.length > 0) {
        events.push({
          type: 'tool_call',
          toolCalls,
        });
      }
    }

    // Finish reason
    if (choice.finish_reason) {
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined;

      events.push({
        type: 'done',
        usage,
      });
    }

    return events;
  }

  private parseToolCalls(raw: {
    index: number;
    id?: string;
    type: 'function';
    function?: { name?: string; arguments?: string };
  }[]): ToolCall[] {
    return raw
      .map((tc) => {
        if (!tc.function?.name || !tc.function.arguments) return null;
        return {
          id: tc.id ?? `call_${tc.index}`,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        };
      })
      .filter((tc): tc is ToolCall => tc !== null);
  }

  private convertResponse(data: { choices: { message: XAIMessage }[]; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }): NormalizedMessage {
    const choice = data.choices[0];
    if (!choice) {
      throw new ProviderMalformedStreamError('xai', 'No choices in response');
    }

    const msg = choice.message;

    return {
      role: msg.role === 'assistant' ? 'assistant' : msg.role,
      content: msg.content ?? null,
      toolCalls: msg.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
      toolCallId: msg.tool_call_id,
      extra: { usage: data.usage },
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const text = await response.text();
    let errorData: XAIErrorResponse;

    try {
      errorData = JSON.parse(text) as XAIErrorResponse;
    } catch {
      throw new ProviderServerError('xai', `HTTP ${response.status}: ${text}`, response.status);
    }

    const message = errorData.error?.message ?? `HTTP ${response.status}`;

    switch (response.status) {
      case 401:
        throw new ProviderAuthError('xai', message, response.status);
      case 429: {
        const retryAfter = response.headers.get('retry-after');
        throw new ProviderRateLimitError('xai', message, retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined, response.status);
      }
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ProviderServerError('xai', message, response.status);
      default:
        throw new ProviderServerError('xai', message, response.status);
    }
  }

  private getContextWindow(modelId: ModelId): number {
    return 131_072; // Both Grok 3 models have 131k context
  }

  private getCapabilities(modelId: ModelId): ModelCapabilities {
    // Both Grok 3 models have vision capabilities
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
      'grok-3': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      'grok-3-mini': { inputPerMillion: 0.3, outputPerMillion: 1.5 },
    };
    return pricing[modelId] ?? { inputPerMillion: 0, outputPerMillion: 0 };
  }
}