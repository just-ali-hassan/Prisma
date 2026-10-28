/**
 * NVIDIA NIM Adapter
 *
 * Implements the ProviderAdapter interface for NVIDIA's NIM API.
 * NVIDIA NIM uses OpenAI-compatible API format.
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

const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';

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

interface NVIDIAMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string | null;
  tool_calls?: NVIDIAToolCall[];
  tool_call_id?: string;
}

interface NVIDIAToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface NVIDIAChatRequest {
  model: string;
  messages: NVIDIAMessage[];
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

interface NVIDIAStreamResponse {
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

interface NVIDIAErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

interface NVIDIAModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export class NVIDIAAdapter implements ProviderAdapter {
  readonly providerId: ProviderId = 'nvidia';
  readonly supportedModels: ModelId[] = [
    'nemotron-3-ultra',
  ];

  private apiKey: string | null = null;
  private abortController: AbortController | null = null;
  private messageNormalizer = createMessageNormalizer('nvidia');

  constructor(private keyManager: { getKey: (provider: string) => Promise<string | undefined> }) {}

  setApiKey(key: string): Promise<void> {
    this.apiKey = key;
    return Promise.resolve();
  }

  private async getApiKey(): Promise<string> {
    const key = (await this.keyManager.getKey('nvidia')) ?? this.apiKey;
    if (!key) {
      throw new ProviderAuthError('nvidia', 'NVIDIA API key not configured');
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

    const nvidiaRequest = this.convertRequest(request);

    try {
      const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(nvidiaRequest),
        signal: combinedSignal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new ProviderMalformedStreamError('nvidia', 'Response body is null');
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
        throw new ProviderCancelledError('nvidia');
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ProviderNetworkError('nvidia', 'Network request failed', error);
      }

      throw new ProviderNetworkError('nvidia', `Unexpected error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    } finally {
      this.abortController = null;
    }
  }

  async chat(request: ChatRequest, signal: AbortSignal): Promise<NormalizedMessage> {
    const apiKey = await this.getApiKey();

    this.abortController = new AbortController();
    const combinedSignal = combineAbortSignals(signal, this.abortController.signal);

    const nvidiaRequest = this.convertRequest(request);
    nvidiaRequest.stream = false;

    let result: NormalizedMessage;

    try {
      const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(nvidiaRequest),
        signal: combinedSignal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as {
        choices: { message: NVIDIAMessage }[];
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
        throw new ProviderCancelledError('nvidia');
      }

      throw new ProviderNetworkError('nvidia', `Unexpected error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    } finally {
      this.abortController = null;
    }

    return result!;
  }

  async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    const apiKey = await this.getApiKey();

    try {
      const response = await fetch(`${NVIDIA_API_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as { data: NVIDIAModel[] };
      return data.data
        .filter((m) => this.supportedModels.includes(m.id))
        .map((m) => ({
          id: m.id,
          provider: 'nvidia',
          name: m.id,
          contextWindow: this.getContextWindow(m.id),
          capabilities: this.getCapabilities(m.id),
          pricing: this.getPricing(m.id),
        }));
    } catch (error) {
      throw new ProviderNetworkError('nvidia', `Failed to list models: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  private convertRequest(request: ChatRequest): NVIDIAChatRequest {
    const messages = request.messages.map((msg) => this.convertMessage(msg));
    if (request.systemPrompt) {
      messages.unshift({ role: 'system', content: request.systemPrompt });
    }

    const modelMapping: Record<string, string> = {
      'nemotron-3-ultra': 'nvidia/nemotron-3-ultra-550b-a55b',
    };
    const model = modelMapping[request.model] ?? request.model;

    return {
      model,
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

  private convertMessage(msg: NormalizedMessage): NVIDIAMessage {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content ?? '',
        tool_call_id: msg.toolCallId!,
      };
    }

    const nvidiaMsg: NVIDIAMessage = {
      role: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system',
      content: msg.content ?? undefined,
    };

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      nvidiaMsg.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));
    }

    // NVIDIA Nemotron doesn't support native image input
    if (msg.attachments && msg.attachments.length > 0) {
      const imageAttachments = msg.attachments.filter((a) => a.type === 'image');
      if (imageAttachments.length > 0) {
        const imageDescriptions = imageAttachments.map((att) =>
          `[Image: ${att.filename || att.path} (${att.mimeType})]`
        ).join('\n');
        nvidiaMsg.content = (nvidiaMsg.content ?? '') + '\n\n' + imageDescriptions;
      }
    }

    return nvidiaMsg;
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
            const parsed = JSON.parse(data) as NVIDIAStreamResponse;
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

  private parseStreamChunk(data: NVIDIAStreamResponse): StreamEvent[] {
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

  private convertResponse(data: { choices: { message: NVIDIAMessage }[]; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }): NormalizedMessage {
    const choice = data.choices[0];
    if (!choice) {
      throw new ProviderMalformedStreamError('nvidia', 'No choices in response');
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
    let errorData: NVIDIAErrorResponse;

    try {
      errorData = JSON.parse(text) as NVIDIAErrorResponse;
    } catch {
      throw new ProviderServerError('nvidia', `HTTP ${response.status}: ${text}`, response.status);
    }

    const message = errorData.error?.message ?? `HTTP ${response.status}`;

    switch (response.status) {
      case 401:
        throw new ProviderAuthError('nvidia', message, response.status);
      case 429: {
        const retryAfter = response.headers.get('retry-after');
        throw new ProviderRateLimitError('nvidia', message, retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined, response.status);
      }
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ProviderServerError('nvidia', message, response.status);
      default:
        throw new ProviderServerError('nvidia', message, response.status);
    }
  }

  private getContextWindow(modelId: ModelId): number {
    return 128_000; // Nemotron 3 Ultra has 128k context
  }

  private getCapabilities(modelId: ModelId): ModelCapabilities {
    return {
      vision: false,
      video: false,
      imageGeneration: false,
      speechToText: false,
      textToSpeech: false,
      toolCalling: true,
      fileInput: false,
      streaming: true,
    };
  }

  private getPricing(modelId: ModelId): ModelPricing {
    const pricing: Record<string, ModelPricing> = {
      'nemotron-3-ultra': { inputPerMillion: 0.0, outputPerMillion: 0.0 },
    };
    return pricing[modelId] ?? { inputPerMillion: 0, outputPerMillion: 0 };
  }
}