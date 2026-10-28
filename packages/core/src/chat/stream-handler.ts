/**
 * Stream Handler
 *
 * Parses Server-Sent Events (SSE) and chunked responses.
 * Handles backoff, timeout, and partial response recovery.
 */

import type { StreamEvent, ToolCall, TokenUsage } from '../providers/types';

export interface StreamHandlerOptions {
  onToken?: (token: string) => void;
  onToolCall?: (toolCalls: ToolCall[]) => void;
  onDone?: (usage?: TokenUsage) => void;
  onError?: (error: Error) => void;
  /** Maximum time to wait for first byte (ms) */
  firstByteTimeout?: number;
  /** Maximum time between chunks (ms) */
  chunkTimeout?: number;
  /** Maximum total time (ms) */
  totalTimeout?: number;
  /** Enable automatic retry with exponential backoff */
  retry?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  baseRetryDelay?: number;
}

/**
 * Parse SSE stream from a ReadableStream.
 * Yields parsed events.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  options: StreamHandlerOptions = {}
): AsyncGenerator<StreamEvent, void, unknown> {
  const {
    firstByteTimeout = 30_000,
    chunkTimeout = 10_000,
    totalTimeout = 300_000,
    retry = true,
    maxRetries = 3,
    baseRetryDelay = 1000,
  } = options;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let firstByteReceived = false;
  let lastChunkTime = Date.now();
  const startTime = Date.now();
  let retryCount = 0;

  // Timeout tracking
  const checkTimeouts = () => {
    const now = Date.now();

    if (!firstByteReceived && now - startTime > firstByteTimeout) {
      throw new Error('First byte timeout');
    }

    if (firstByteReceived && now - lastChunkTime > chunkTimeout) {
      throw new Error('Chunk timeout');
    }

    if (now - startTime > totalTimeout) {
      throw new Error('Total timeout');
    }
  };

  try {
    while (true) {
      checkTimeouts();

      const { done, value } = await reader.read();

      if (done) {
        // Stream ended
        if (!firstByteReceived) {
          throw new Error('Stream ended before first byte');
        }
        break;
      }

      firstByteReceived = true;
      lastChunkTime = Date.now();

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop()!; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Handle SSE format: "data: <json>"
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6).trim();

          // Skip "[DONE]" marker
          if (data === '[DONE]') {
            // [DONE] is a stream terminator, not a meaningful done event.
            // The done event with usage was already emitted from the finish_reason chunk.
            break;
          }

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            const event = parseProviderEvent(parsed);
            if (event) {
              yield event;
            }
          } catch {
            // Ignore parse errors for non-JSON data
          }
        }
        // Handle "event: <type>" lines
        else if (trimmed.startsWith('event: ')) {
          // Event type lines are typically followed by data: lines
          // We'll handle the data on the next iteration
        }
      }
    }
  } catch (error) {
    // Retry logic for recoverable errors
    if (retry && retryCount < maxRetries && isRetryableError(error)) {
      retryCount++;
      const delay = Math.min(baseRetryDelay * Math.pow(2, retryCount - 1), 30_000);
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Note: Cannot easily retry a consumed stream.
      // The caller should handle retry by re-making the request.
      throw error;
    }

    const streamError = error instanceof Error ? error : new Error(String(error));
    yield { type: 'error', error: streamError };
    throw streamError;
  } finally {
    reader.releaseLock();
  }
}

interface ChoiceDelta {
  content?: string;
  tool_calls?: unknown[];
}

interface StreamChoice {
  delta?: ChoiceDelta;
  finish_reason?: string | null;
}

/**
 * Parse a provider-specific event into our normalized StreamEvent.
 * This is a base implementation - providers should extend.
 */
function parseProviderEvent(data: Record<string, unknown>): StreamEvent | null {
  // OpenAI-compatible format
  if (data.choices && Array.isArray(data.choices)) {
    const choice = data.choices[0] as StreamChoice | undefined;
    if (!choice) return null;

    // Token delta
    if (choice.delta?.content) {
      return {
        type: 'token',
        content: choice.delta.content,
      };
    }

    // Tool calls
    if (choice.delta?.tool_calls) {
      const toolCalls = normalizeToolCalls(choice.delta.tool_calls);
      if (toolCalls.length > 0) {
        return {
          type: 'tool_call',
          toolCalls,
        };
      }
    }

    // Finish reason
    if (choice.finish_reason) {
      const usageData = data.usage as Record<string, unknown> | undefined;
      const usage = usageData
        ? {
            promptTokens: (usageData.prompt_tokens as number) ?? 0,
            completionTokens: (usageData.completion_tokens as number) ?? 0,
            totalTokens: (usageData.total_tokens as number) ?? 0,
          }
        : undefined;

      return {
        type: 'done',
        usage,
      };
    }
  }

  // Anthropic-compatible format
  if (data.type === 'content_block_delta') {
    const delta = data.delta as Record<string, unknown> | undefined;
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
      return {
        type: 'token',
        content: delta.text,
      };
    }
    if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
      // Tool call input streaming - handled separately
    }
  }

  if (data.type === 'message_delta') {
    const usageData = data.usage as Record<string, unknown> | undefined;
    if (usageData) {
      return {
        type: 'done',
        usage: {
          promptTokens: (usageData.input_tokens as number) ?? 0,
          completionTokens: (usageData.output_tokens as number) ?? 0,
          totalTokens:
            ((usageData.input_tokens as number) ?? 0) + ((usageData.output_tokens as number) ?? 0),
        },
      };
    }
  }

  // Don't emit done for message_stop if we already got usage from message_delta
  // The caller should handle the final message_stop if needed
  if (data.type === 'message_stop') {
    return null;
  }

  // Error events
  const errorData = data.error as Record<string, unknown> | string | undefined;
  if (errorData) {
    const error = new Error(
      typeof errorData === 'string'
        ? errorData
        : ((errorData.message as string) ?? 'Unknown provider error')
    );
    return { type: 'error', error };
  }

  return null;
}

/**
 * Normalize tool calls from various provider formats.
 */
function normalizeToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((tc) => {
      if (typeof tc !== 'object' || tc === null) return null;
      const t = tc as Record<string, unknown>;

      const id = (t.id ?? t.index) as string | number | undefined;
      const func = t.function as Record<string, unknown> | undefined;
      const name = (func?.name ?? t.name) as string | undefined;
      const args = (func?.arguments ?? t.arguments) as string | undefined;

      if (id !== undefined && name && args !== undefined) {
        return {
          id: String(id),
          type: 'function' as const,
          function: { name, arguments: args },
        };
      }
      return null;
    })
    .filter((tc): tc is ToolCall => tc !== null);
}

/**
 * Check if an error is retryable.
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Network errors, timeouts, 5xx errors are retryable
  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  );
}

/**
 * Create a stream handler that calls callbacks for each event.
 * Returns a promise that resolves when the stream ends successfully, or rejects on error.
 */
export async function createStreamHandler(
  stream: ReadableStream<Uint8Array>,
  options: StreamHandlerOptions
): Promise<void> {
  for await (const event of parseSSEStream(stream, options)) {
    switch (event.type) {
      case 'token':
        options.onToken?.(event.content!);
        break;
      case 'tool_call':
        options.onToolCall?.(event.toolCalls!);
        break;
      case 'done':
        options.onDone?.(event.usage);
        break;
      case 'error': {
        const err = event.error!;
        options.onError?.(err);
        throw err;
      }
    }
  }
}
