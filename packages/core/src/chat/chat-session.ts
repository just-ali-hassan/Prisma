/**
 * Chat Session Manager
 *
 * Manages a single chat conversation: send, stream, cancel, retry.
 * Handles message history, streaming state, and persistence coordination.
 */

import type {
  ProviderAdapter,
  ChatRequest,
  NormalizedMessage,
  ModelId,
  ProviderId,
  ToolCall,
  TokenUsage,
} from '../providers/types';
import { providerRegistry, getAdapter } from '../providers/registry';
import type { StreamHandlerOptions } from './stream-handler';
import { createMessageNormalizer } from './message-normalizer';
import { getModelCapabilities } from '../providers/capability-table';

function estimateMessageCost(provider: ProviderId, model: ModelId, usage: TokenUsage): number | undefined {
  const pricing = getModelCapabilities(provider, model)?.pricing;
  if (!pricing) return undefined;

  return (
    (usage.promptTokens * pricing.inputPerMillion + usage.completionTokens * pricing.outputPerMillion) /
    1_000_000
  );
}

function extractTokenUsage(response: NormalizedMessage): TokenUsage | undefined {
  const rawUsage = (response.extra as { usage?: Record<string, number> } | undefined)?.usage;

  if (rawUsage) {
    const promptTokens =
      rawUsage.promptTokens ?? rawUsage.prompt_tokens ?? rawUsage.input_tokens ?? rawUsage.promptTokenCount ?? 0;
    const completionTokens =
      rawUsage.completionTokens ??
      rawUsage.completion_tokens ??
      rawUsage.output_tokens ??
      rawUsage.candidatesTokenCount ??
      0;
    const totalTokens =
      rawUsage.totalTokens ??
      rawUsage.total_tokens ??
      rawUsage.totalTokenCount ??
      promptTokens + completionTokens;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }

  if (typeof response.tokenCount === 'number') {
    return {
      promptTokens: 0,
      completionTokens: response.tokenCount,
      totalTokens: response.tokenCount,
    };
  }

  return undefined;
}

export interface ChatSessionOptions {
  /** Called for each token in the stream */
  onToken?: (token: string) => void;
  /** Called when tool calls are received */
  onToolCall?: (toolCalls: ToolCall[]) => void;
  /** Called when the stream completes */
  onDone?: (usage?: TokenUsage) => void;
  /** Called on stream error */
  onError?: (error: Error) => void;
  /** Called when message is added to history */
  onMessage?: (message: NormalizedMessage) => void;
  /** Called when a conversation title should be generated (first assistant response) */
  onTitleGenerate?: (title: string) => void;
  /** Stream handler options */
  streamOptions?: StreamHandlerOptions;
}

export interface ChatSessionState {
  messages: NormalizedMessage[];
  isStreaming: boolean;
  currentModel: ModelId;
  currentProvider: ProviderId;
  abortController: AbortController | null;
}

export class ChatSession {
  private state: ChatSessionState;
  private options: ChatSessionOptions;
  private messageNormalizer = createMessageNormalizer(''); // Will be updated per request

  constructor(
    initialMessages: NormalizedMessage[] = [],
    model: ModelId,
    provider: ProviderId,
    options: ChatSessionOptions = {}
  ) {
    this.state = {
      messages: [...initialMessages],
      isStreaming: false,
      currentModel: model,
      currentProvider: provider,
      abortController: null,
    };
    this.options = options;
  }

  /**
   * Get current session state.
   */
  getState(): Readonly<ChatSessionState> {
    return { ...this.state };
  }

  /**
   * Get message history.
   */
  getMessages(): NormalizedMessage[] {
    return [...this.state.messages];
  }

  /**
   * Check if currently streaming.
   */
  isStreaming(): boolean {
    return this.state.isStreaming;
  }

  /**
   * Check if the currently selected model supports streaming.
   */
  supportsStreaming(): boolean {
    const capabilities = getModelCapabilities(this.state.currentProvider, this.state.currentModel)?.capabilities;
    return capabilities?.streaming !== false;
  }

  /**
   * Send a message and stream the response.
   */
  async sendMessage(
    content: string,
    attachments?: NormalizedMessage['attachments'],
    options: Partial<ChatRequest> = {}
  ): Promise<void> {
    if (this.state.isStreaming) {
      // istanbul ignore next - hard to test without creating a streaming race condition
      throw new Error('Already streaming. Cancel current request first.');
    }

    const capabilities = getModelCapabilities(this.state.currentProvider, this.state.currentModel)?.capabilities;

    if (attachments && attachments.length > 0) {
      const hasImage = attachments.some(
        (a) => a.type === 'image' || a.mimeType?.startsWith('image/')
      );
      if (hasImage && capabilities?.vision === false) {
        throw new Error(`${this.state.currentModel} does not support image attachments.`);
      }

      const hasFile = attachments.some(
        (a) => a.type === 'file' && !a.mimeType?.startsWith('image/')
      );
      if (hasFile && capabilities?.fileInput === false) {
        throw new Error(`${this.state.currentModel} does not support file attachments.`);
      }
    }

    const adapter = getAdapter(this.state.currentProvider);
    this.messageNormalizer = createMessageNormalizer(this.state.currentProvider);

    // Create abort controller for this request
    this.state.abortController = new AbortController();
    this.state.isStreaming = true;

    // Add user message to history
    const userMessage: NormalizedMessage = {
      role: 'user',
      content,
      attachments,
    };
    this.state.messages.push(userMessage);
    this.options.onMessage?.(userMessage);

    const useStreaming = this.supportsStreaming() && options.stream !== false;

    // Build request
    const request: ChatRequest = {
      messages: this.state.messages,
      model: this.state.currentModel,
      provider: this.state.currentProvider,
      stream: useStreaming,
      ...options,
    };
    if (!this.supportsStreaming()) {
      request.stream = false;
    }

    // Sanitize unsupported parameters
    const isReasoning = Boolean(capabilities?.reasoning) || /^(o1|o3|o4)/i.test(this.state.currentModel);
    if (isReasoning) {
      delete request.temperature;
      delete request.topP;
      delete request.frequencyPenalty;
      delete request.presencePenalty;
    } else if (this.state.currentProvider === 'anthropic' || this.state.currentProvider === 'google') {
      delete request.frequencyPenalty;
      delete request.presencePenalty;
    }

    if (capabilities?.toolCalling === false) {
      delete request.tools;
      delete request.toolChoice;
    }

    try {
      if (useStreaming) {
        await this.streamRequest(adapter, request);
      } else {
        await this.nonStreamRequest(adapter, request);
      }
    } finally {
      this.state.isStreaming = false;
      this.state.abortController = null;
    }
  }

  private finalizeAssistantMessage(
    assistantContent: string | null,
    assistantToolCalls: ToolCall[],
    usage?: TokenUsage,
    error?: Error,
    extra?: Record<string, unknown>
  ): void {
    let content: string | null = assistantContent || null;
    if (error) {
      content = assistantContent ? `${assistantContent}\n\n[Error: ${error.message}]` : `Error: ${error.message}`;
    }

    const assistantMessage: NormalizedMessage = {
      role: 'assistant',
      content,
      modelId: this.state.currentModel,
      toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : undefined,
      ...(usage
        ? {
            tokenCount: usage.totalTokens,
            cost: estimateMessageCost(this.state.currentProvider, this.state.currentModel, usage),
            extra: { ...extra, usage },
          }
        : extra
          ? { extra }
          : {}),
    };
    this.state.messages.push(assistantMessage);
    this.options.onMessage?.(assistantMessage);

    // Auto-generate title from first user message if this is the first assistant response
    const userMessages = this.state.messages.filter((m) => m.role === 'user');
    const assistantMessages = this.state.messages.filter((m) => m.role === 'assistant');
    if (userMessages.length === 1 && assistantMessages.length === 1) {
      const firstUserMsg = userMessages[0];
      if (firstUserMsg.content) {
        const title =
          firstUserMsg.content.slice(0, 50).replace(/\n/g, ' ') +
          (firstUserMsg.content.length > 50 ? '...' : '');
        this.options.onTitleGenerate?.(title);
      }
    }

    if (error) {
      this.options.onError?.(error);
    } else {
      this.options.onDone?.(usage);
    }
  }

  /**
   * Stream a request to the provider.
   */
  private async streamRequest(adapter: ProviderAdapter, request: ChatRequest): Promise<void> {
    const { signal } = this.state.abortController!;

    // Collect assistant message as it streams
    let assistantContent = '';
    const assistantToolCalls: ToolCall[] = [];
    let finalized = false;

    const finalize = (usage?: TokenUsage, error?: Error) => {
      if (finalized) return;
      finalized = true;
      this.finalizeAssistantMessage(assistantContent, assistantToolCalls, usage, error);
    };

    const streamOptions: StreamHandlerOptions = {
      ...this.options.streamOptions,
      onToken: (token) => {
        assistantContent += token;
        this.options.onToken?.(token);
      },
      onToolCall: (toolCalls) => {
        assistantToolCalls.push(...toolCalls);
        this.options.onToolCall?.(toolCalls);
      },
      onDone: (usage) => {
        finalize(usage);
      },
      onError: (error) => {
        finalize(undefined, error);
      },
    };

    try {
      await adapter.stream(
        request,
        (event) => {
          switch (event.type) {
            case 'token':
              streamOptions.onToken?.(event.content ?? '');
              break;
            case 'tool_call':
              streamOptions.onToolCall?.(event.toolCalls ?? []);
              break;
            case 'done':
              streamOptions.onDone?.(event.usage);
              break;
            case 'error':
              streamOptions.onError?.(event.error ?? new Error('Unknown error'));
              break;
          }
        },
        signal,
      );
    } catch (error) {
      if (signal.aborted) {
        finalize();
      } else {
        finalize(undefined, error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }

  /**
   * Send a non-streaming chat request to the provider.
   */
  private async nonStreamRequest(adapter: ProviderAdapter, request: ChatRequest): Promise<void> {
    const { signal } = this.state.abortController!;

    try {
      const response = await adapter.chat(request, signal);

      if (response.content) {
        this.options.onToken?.(response.content);
      }
      if (response.toolCalls && response.toolCalls.length > 0) {
        this.options.onToolCall?.(response.toolCalls);
      }

      const usage = extractTokenUsage(response);

      this.finalizeAssistantMessage(
        response.content,
        response.toolCalls ?? [],
        usage,
        undefined,
        response.extra
      );
    } catch (error) {
      if (signal.aborted) {
        this.finalizeAssistantMessage(null, []);
      } else {
        this.finalizeAssistantMessage(
          null,
          [],
          undefined,
          error instanceof Error ? error : new Error(String(error))
        );
      }
      throw error;
    }
  }

  /**
   * Cancel the current streaming request.
   */
  cancel(): void {
    if (this.state.abortController) {
      this.state.abortController.abort();
    }
    this.state.isStreaming = false;
  }

  /**
   * Retry the last assistant response.
   * Removes the last assistant message and re-streams.
   */
  async retry(): Promise<void> {
    if (this.state.isStreaming) {
      throw new Error('Cannot retry while streaming');
    }

    // Find and remove last assistant message
    const lastAssistantIndex = this.state.messages
      .map((m, i) => (m.role === 'assistant' ? i : -1))
      .filter((i) => i !== -1)
      .pop();

    if (lastAssistantIndex !== undefined) {
      this.state.messages.splice(lastAssistantIndex);
    }

    // Re-send the last user message (or regenerate from context)
    // For simplicity, we'll just re-stream with the same context
    // The adapter will generate a new response
    const adapter = getAdapter(this.state.currentProvider);
    this.state.abortController = new AbortController();
    this.state.isStreaming = true;

    const useStreaming = this.supportsStreaming();

    const request: ChatRequest = {
      messages: this.state.messages,
      model: this.state.currentModel,
      provider: this.state.currentProvider,
      stream: useStreaming,
    };

    try {
      if (useStreaming) {
        await this.streamRequest(adapter, request);
      } else {
        await this.nonStreamRequest(adapter, request);
      }
    } finally {
      this.state.isStreaming = false;
      this.state.abortController = null;
    }
  }

  /**
   * Update the model for future messages.
   */
  setModel(model: ModelId): void {
    this.state.currentModel = model;
  }

  /**
   * Update the provider for future messages.
   */
  setProvider(provider: ProviderId): void {
    if (!providerRegistry.has(provider)) {
      throw new Error(`Provider ${provider} not registered`);
    }
    this.state.currentProvider = provider;
  }

  /**
   * Add a system message to the conversation.
   */
  addSystemMessage(content: string): void {
    const systemMessage: NormalizedMessage = {
      role: 'system',
      content,
    };
    // Insert at the beginning (after any existing system messages)
    const firstNonSystemIndex = this.state.messages.findIndex((m) => m.role !== 'system');
    if (firstNonSystemIndex === -1) {
      this.state.messages.push(systemMessage);
    } else {
      this.state.messages.splice(firstNonSystemIndex, 0, systemMessage);
    }
    // istanbul ignore next - optional callback, hard to test without setting up callback
    this.options.onMessage?.(systemMessage);
  }

  /**
   * Clear all messages except system messages.
   */
  clearHistory(keepSystem = true): void {
    if (keepSystem) {
      const systemMessages = this.state.messages.filter((m) => m.role === 'system');
      this.state.messages = systemMessages;
    } else {
      this.state.messages = [];
    }
  }

  /**
   * Get token count estimate for current conversation.
   */
  estimateTokens(): number {
    // Rough estimate: ~4 characters per token
    return this.state.messages.reduce(
      (sum, m) => sum + (typeof m.content === 'string' ? m.content.length / 4 : 0),
      0
    );
  }
}

/**
 * Create a new chat session.
 */
export function createChatSession(
  model: ModelId,
  provider: ProviderId,
  options: ChatSessionOptions = {}
): ChatSession {
  return new ChatSession([], model, provider, options);
}
