/**
 * Stream Handler Tests
 *
 * Tests for SSE parsing, backoff, timeout, and partial recovery.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSSEStream, createStreamHandler } from '../stream-handler';
import type { StreamEvent, StreamHandlerOptions, ToolCall } from '../../providers/types';

describe('Stream Handler', () => {
  const createMockStream = (chunks: string[]) => {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });
  };

  describe('parseSSEStream', () => {
    it('parses token events correctly', async () => {
      const chunks = [
        'data: {"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ];

      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];

      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }

      expect(events).toHaveLength(3); // 2 tokens + done (with usage)
      expect(events[0]).toEqual({ type: 'token', content: 'Hello' });
      expect(events[1]).toEqual({ type: 'token', content: ' world' });
      expect(events[2]).toEqual({
        type: 'done',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
    });

    it('parses tool call events', async () => {
      const chunks = [
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{\\"location\\":\\"NYC\\"}"}}]},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];

      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('tool_call');
      expect(events[0].toolCalls).toHaveLength(1);
      expect(events[0].toolCalls![0]).toEqual({
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
      });
      expect(events[1].type).toBe('done');
    });

    it('handles Anthropic-style events', async () => {
      const chunks = [
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","usage":{"input_tokens":10,"output_tokens":5}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ];

      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];

      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'token', content: 'Hello' });
      expect(events[1]).toEqual({ type: 'token', content: ' world' });
      expect(events[2]).toEqual({
        type: 'done',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
    });

    it('handles error events', async () => {
      const chunks = [
        'data: {"error":{"message":"Rate limit exceeded","type":"rate_limit_error"}}\n\n',
      ];

      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];

      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].error).toBeInstanceOf(Error);
      expect(events[0].error?.message).toBe('Rate limit exceeded');
    });

    it('handles error events with string error payload', async () => {
      const chunks = ['data: {"error":"Raw error message"}\n\n'];
      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];
      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }
      expect(events[0].error?.message).toBe('Raw error message');
    });

    it('filters invalid tool call items in chunks', async () => {
      const chunks = [
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"invalid":true}]},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ];
      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];
      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }
      expect(events).toHaveLength(0);
    });

    it('skips empty lines and comments', async () => {
      const chunks = [
        '\n',
        ': this is a comment\n',
        'data: {"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        '\n',
        'data: [DONE]\n\n',
      ];

      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];

      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'token', content: 'Hello' });
    });

    it('retries on retryable errors when retry option is enabled', async () => {
      const failingStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error('network error: ECONNRESET'));
        },
      });

      await expect(async () => {
        for await (const _event of parseSSEStream(failingStream, { retry: true, maxRetries: 1, baseRetryDelay: 1 })) {
          // consume
        }
      }).rejects.toThrow('network error');
    });

    it('identifies non-retryable errors', async () => {
      const failingStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error('invalid request parameter'));
        },
      });

      await expect(async () => {
        for await (const _event of parseSSEStream(failingStream, { retry: true, maxRetries: 1, baseRetryDelay: 1 })) {
          // consume
        }
      }).rejects.toThrow('invalid request parameter');
    });

    it('handles partial lines across chunks', async () => {
      const chunks = [
        'data: {"cho',
        'ices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];

      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'token', content: 'Hello' });
    });

    it('throws when stream ends before first byte', async () => {
      const emptyStream = createMockStream([]);
      await expect(async () => {
        for await (const _event of parseSSEStream(emptyStream)) {
          // consume
        }
      }).rejects.toThrow('Stream ended before first byte');
    });

    it('ignores non-JSON data lines without throwing', async () => {
      const chunks = [
        'data: this is not json\n\n',
        'data: [DONE]\n\n',
      ];
      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];
      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }
      expect(events).toHaveLength(0);
    });

    it('covers edge parsing cases in parseProviderEvent and normalizeToolCalls', async () => {
      const chunks = [
        'data: {"type":"message_delta","usage":{}}\n\n',
        'data: {"error":{}}\n\n',
        'data: {"choices":[{"index":0,"delta":{"tool_calls":"not_an_array"}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[null, 123]}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];
      try {
        for await (const event of parseSSEStream(stream)) {
          events.push(event);
        }
      } catch {
        // expected error from parseSSEStream
      }
      expect(events.some((e) => e.type === 'done')).toBe(true);
      expect(events.some((e) => e.type === 'error')).toBe(true);
    });

    it('handles empty choices and empty usage object', async () => {
      const chunks = [
        'data: {"choices":[]}\n\n',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{}}\n\n',
        'data: [DONE]\n\n',
      ];
      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];
      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'done',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });
    });

    it('times out when first byte is delayed', async () => {
      const stream = createMockStream(['data: {}\n\n']);
      await expect(async () => {
        for await (const _ of parseSSEStream(stream, { firstByteTimeout: -1 })) {}
      }).rejects.toThrow('First byte timeout');
    });

    it('does not retry when retry is disabled', async () => {
      const stream = createMockStream(['data: {}\n\n']);
      await expect(async () => {
        for await (const _ of parseSSEStream(stream, { firstByteTimeout: -1, retry: false })) {}
      }).rejects.toThrow('First byte timeout');
    });

    it('does not retry when maxRetries is 0', async () => {
      const stream = createMockStream(['data: {}\n\n']);
      await expect(async () => {
        for await (const _ of parseSSEStream(stream, { firstByteTimeout: -1, maxRetries: 0 })) {}
      }).rejects.toThrow('First byte timeout');
    });

    it('releases lock when generator is exited early', async () => {
      const chunks = [
        'data: {"choices":[{"index":0,"delta":{"content":"One"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{"content":"Two"},"finish_reason":null}]}\n\n',
      ];
      const stream = createMockStream(chunks);
      for await (const event of parseSSEStream(stream)) {
        if (event.type === 'token') {
          break;
        }
      }
      expect(stream.locked).toBe(false);
    });

    it('times out when chunk is delayed', async () => {
      const stream = createMockStream(['data: {}\n\n', 'data: [DONE]\n\n']);
      await expect(async () => {
        for await (const _ of parseSSEStream(stream, { firstByteTimeout: 999999, chunkTimeout: -1 })) {}
      }).rejects.toThrow('Chunk timeout');
    });

    it('times out when total duration exceeds limit', async () => {
      const stream = createMockStream(['data: {}\n\n']);
      await expect(async () => {
        for await (const _ of parseSSEStream(stream, { firstByteTimeout: 999999, totalTimeout: -1 })) {}
      }).rejects.toThrow('Total timeout');
    });

    it('handles input_json_delta type in Anthropic events', async () => {
      const chunks = [
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ];
      const stream = createMockStream(chunks);
      const events: StreamEvent[] = [];
      for await (const event of parseSSEStream(stream)) {
        events.push(event);
      }
      expect(events).toHaveLength(0);
    });
  });

  describe('createStreamHandler', () => {
    it('calls callbacks for each event', async () => {
      const chunks = [
        'data: {"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ];

      const stream = createMockStream(chunks);
      const onToken = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await createStreamHandler(stream, {
        onToken,
        onDone,
        onError,
      });

      expect(onToken).toHaveBeenCalledTimes(1);
      expect(onToken).toHaveBeenCalledWith('Hello');
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onDone).toHaveBeenCalledWith({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
      expect(onError).not.toHaveBeenCalled();
    });

    it('calls onError for error events', async () => {
      const chunks = [
        'data: {"error":{"message":"Rate limit exceeded"}}\n\n',
      ];

      const stream = createMockStream(chunks);
      const onError = vi.fn();

      await expect(
        createStreamHandler(stream, { onError }),
      ).rejects.toThrow();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('calls onToolCall for tool call events', async () => {
      const chunks = [
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{\\"location\\":\\"NYC\\"}"}}]},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const stream = createMockStream(chunks);
      const onToolCall = vi.fn();

      await createStreamHandler(stream, { onToolCall });

      expect(onToolCall).toHaveBeenCalledTimes(1);
    });

    it('handles non-Error thrown in stream reader', async () => {
      const stream = new ReadableStream({
        pull() {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'Non-error stream failure';
        },
      });

      await expect(async () => {
        for await (const _ of parseSSEStream(stream, { retry: true })) {}
      }).rejects.toThrow('Non-error stream failure');
    });

    it('handles null or missing event content in createStreamHandler', async () => {
      const chunks = [
        'data: {"choices":[{"index":0,"delta":{}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      const stream = createMockStream(chunks);
      const onToken = vi.fn();
      await createStreamHandler(stream, { onToken });
      expect(onToken).not.toHaveBeenCalled();
    });
  });
});