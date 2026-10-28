/**
 * Google Gemini Adapter
 *
 * Implements the ProviderAdapter interface for Google's Gemini API.
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

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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

  controller.signal.addEventListener('abort', () => {
    for (const signal of signals) {
      signal.removeEventListener('abort', abort);
    }
  }, { once: true });

  return controller.signal;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiTool {
  functionDeclarations: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  }[];
}

interface GeminiToolConfig {
  functionCallingConfig?: {
    mode: 'AUTO' | 'ANY' | 'NONE';
    allowedFunctionNames?: string[];
  };
}

interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseMimeType?: string;
}

interface GeminiChatRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  generationConfig?: GeminiGenerationConfig;
}

interface GeminiStreamResponse {
  candidates?: {
    content?: {
      parts: GeminiPart[];
      role: 'model';
    };
    finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    index: number;
  }[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GeminiErrorResponse {
  error: {
    message: string;
    code: number;
    status: string;
  };
}

interface GeminiModel {
  name: string;
  version: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
  temperature?: number;
  maxTemperature?: number;
  topP?: number;
  topK?: number;
}

export class GoogleAdapter implements ProviderAdapter {
  readonly providerId: ProviderId = 'google';
  readonly supportedModels: ModelId[] = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ];

  private apiKey: string | null = null;
  private abortController: AbortController | null = null;
  private messageNormalizer = createMessageNormalizer('google');

  constructor(private keyManager: { getKey: (provider: string) => Promise<string | undefined> }) {}

  setApiKey(key: string): Promise<void> {
    this.apiKey = key;
    return Promise.resolve();
  }

  private async getApiKey(): Promise<string> {
    const key = (await this.keyManager.getKey('google')) ?? this.apiKey;
    if (!key) {
      throw new ProviderAuthError('google', 'Google API key not configured');
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

    const geminiRequest = this.convertRequest(request);
    const modelName = request.model.replace('gemini-', 'models/gemini-');

    try {
      const response = await fetch(`${GEMINI_API_BASE}/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequest),
        signal: combinedSignal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new ProviderMalformedStreamError('google', 'Response body is null');
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
        throw new ProviderCancelledError('google');
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ProviderNetworkError('google', 'Network request failed', error);
      }

      throw new ProviderNetworkError('google', `Unexpected error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    } finally {
      this.abortController = null;
    }
  }

  async chat(request: ChatRequest, signal: AbortSignal): Promise<NormalizedMessage> {
    const apiKey = await this.getApiKey();

    this.abortController = new AbortController();
    const combinedSignal = combineAbortSignals(signal, this.abortController.signal);

    const geminiRequest = this.convertRequest(request);
    const modelName = request.model.replace('gemini-', 'models/gemini-');

    let result: NormalizedMessage;

    try {
      const response = await fetch(`${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequest),
        signal: combinedSignal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      const data = await response.json() as GeminiStreamResponse;
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
        throw new ProviderCancelledError('google');
      }

      throw new ProviderNetworkError('google', `Unexpected error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    } finally {
      this.abortController = null;
    }

    return result!;
  }

  async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    const apiKey = await this.getApiKey();

    try {
      const response = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        return await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as { models: GeminiModel[] };
      return data.models
        .filter((m) => this.supportedModels.some(sm => m.name.includes(sm)))
        .map((m) => {
          const cleanName = m.name.replace('models/', '');
          return {
            id: cleanName,
            provider: 'google',
            name: m.displayName || m.name,
            contextWindow: m.inputTokenLimit + m.outputTokenLimit,
            capabilities: this.getCapabilities(cleanName),
            pricing: this.getPricing(cleanName),
          };
        });
    } catch (error) {
      throw new ProviderNetworkError('google', `Failed to list models: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  private convertRequest(request: ChatRequest): GeminiChatRequest {
    const contents: GeminiContent[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') continue; // Handled separately

      const parts: GeminiPart[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            },
          });
        }
      }

      if (msg.attachments && msg.attachments.length > 0) {
        const imageAttachments = msg.attachments.filter((a) => a.type === 'image');
        for (const att of imageAttachments) {
          const base64Data = att.path.startsWith('data:')
            ? att.path.split(',')[1]
            : att.path;
          const mimeType = att.mimeType || 'image/png';
          parts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        }
      }

      if (parts.length > 0) {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts,
        });
      }
    }

    // Handle tool results
    for (const msg of request.messages) {
      if (msg.role === 'tool' && msg.toolCallId && msg.content) {
        // Find the last model message and append function response
        let lastModelIdx = -1;
        for (let i = contents.length - 1; i >= 0; i--) {
          if (contents[i].role === 'model') {
            lastModelIdx = i;
            break;
          }
        }
        if (lastModelIdx >= 0) {
          contents[lastModelIdx].parts.push({
            functionResponse: {
              name: msg.toolCallId,
              response: { result: msg.content },
            },
          });
        }
      }
    }

    const tools = request.tools?.map((t) => ({
      functionDeclarations: [{
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      }],
    }));

    const toolConfig = request.toolChoice ? this.convertToolChoice(request.toolChoice) : undefined;

    return {
      contents,
      systemInstruction: request.systemPrompt ? { parts: [{ text: request.systemPrompt }] } : undefined,
      tools,
      toolConfig,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        topP: request.topP,
        topK: request.extra?.top_k as number | undefined,
        maxOutputTokens: request.maxTokens,
      },
    };
  }

  private convertToolChoice(choice: ChatRequest['toolChoice']): GeminiToolConfig | undefined {
    if (choice === 'auto') {
      return { functionCallingConfig: { mode: 'AUTO' } };
    }
    if (choice === 'none') {
      return { functionCallingConfig: { mode: 'NONE' } };
    }
    if (typeof choice === 'object' && choice.type === 'function') {
      return {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [choice.function.name],
        },
      };
    }
    return undefined;
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
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data) as GeminiStreamResponse;

            if (parsed.candidates && parsed.candidates.length > 0) {
              const candidate = parsed.candidates[0];

              if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    onEvent({ type: 'token', content: part.text });
                  } else if (part.functionCall) {
                    onEvent({
                      type: 'tool_call',
                      toolCalls: [{
                        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        type: 'function',
                        function: {
                          name: part.functionCall.name,
                          arguments: JSON.stringify(part.functionCall.args),
                        },
                      }],
                    });
                  }
                }
              }

              if (candidate.finishReason) {
                // Don't emit done immediately - wait for usageMetadata which may come in a later chunk
                // Mark that we've seen finishReason
                if (!hasEmittedDone && streamUsage) {
                  hasEmittedDone = true;
                  onEvent({ type: 'done', usage: streamUsage });
                }
              }
            }

            if (parsed.usageMetadata) {
              streamUsage = {
                promptTokens: parsed.usageMetadata.promptTokenCount,
                completionTokens: parsed.usageMetadata.candidatesTokenCount,
                totalTokens: parsed.usageMetadata.totalTokenCount,
              };
              // If we already saw finishReason, emit done now with usage
              if (!hasEmittedDone && parsed.candidates?.[0]?.finishReason) {
                hasEmittedDone = true;
                onEvent({ type: 'done', usage: streamUsage });
              }
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

  private convertResponse(data: GeminiStreamResponse): NormalizedMessage {
    let content: string | null = null;
    const toolCalls: ToolCall[] = [];

    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            content = part.text;
          } else if (part.functionCall) {
            toolCalls.push({
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args),
              },
            });
          }
        }
      }
    }

    return {
      role: 'assistant',
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      extra: { usage: data.usageMetadata },
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const text = await response.text();
    let errorData: GeminiErrorResponse;

    try {
      errorData = JSON.parse(text) as GeminiErrorResponse;
    } catch {
      throw new ProviderServerError('google', `HTTP ${response.status}: ${text}`, response.status);
    }

    const message = errorData.error?.message ?? `HTTP ${response.status}`;

    switch (response.status) {
      case 400:
        // Check if it's an auth error
        if (errorData.error?.status === 'UNAUTHENTICATED' || message.includes('API key')) {
          throw new ProviderAuthError('google', message, response.status);
        }
        throw new ProviderServerError('google', message, response.status);
      case 401:
      case 403:
        throw new ProviderAuthError('google', message, response.status);
      case 429: {
        const retryAfter = response.headers.get('retry-after');
        throw new ProviderRateLimitError('google', message, retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined, response.status);
      }
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ProviderServerError('google', message, response.status);
      default:
        throw new ProviderServerError('google', message, response.status);
    }
  }

  private getContextWindow(modelId: ModelId): number {
    const contextWindows: Record<string, number> = {
      'gemini-1.5-flash': 1_000_000,
      'gemini-1.5-pro': 2_000_000,
    };
    return contextWindows[modelId] ?? 1_000_000;
  }

  private getCapabilities(modelId: ModelId): ModelCapabilities {
    // Both Gemini 1.5 models have the same multimodal capabilities
    return {
      vision: true,
      video: true,
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
      'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
      'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.0 },
    };
    return pricing[modelId] ?? { inputPerMillion: 0, outputPerMillion: 0 };
  }
}