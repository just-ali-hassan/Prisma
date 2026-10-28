/**
 * OpenAI Adapter Tests
 *
 * Tests for the OpenAI adapter with mocked API responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIAdapter } from '../openai.adapter';
import type { ChatRequest, NormalizedMessage, StreamEvent, ToolCall, ModelId, ProviderId } from '../../types';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderNetworkError,
  ProviderServerError,
  ProviderCancelledError,
  ProviderMalformedStreamError,
} from '../../types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock key manager
const mockKeyManager = {
  getKey: vi.fn().mockResolvedValue('sk-test-key-12345678901234567890123456789012345678901234'),
};

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;
  let abortController: AbortController;

  beforeEach(() => {
    abortController = new AbortController();
    vi.clearAllMocks();
    adapter = new OpenAIAdapter(mockKeyManager);
  });

  afterEach(() => {
    adapter.cancel();
  });

  describe('stream', () => {
    const createMockStream = (chunks: string[]) => {
      let index = 0;
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (index < chunks.length) {
            controller.enqueue(new TextEncoder().encode(chunks[index++]));
          } else {
            controller.close();
          }
        },
      });
    };

    const mockMessages: NormalizedMessage[] = [
      { role: 'user', content: 'Hello' },
    ];

    const mockRequest: ChatRequest = {
      messages: mockMessages,
      model: 'gpt-4o',
      provider: 'openai',
      stream: true,
    };

    it('streams tokens correctly for a successful response', async () => {
      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(mockRequest, (e) => events.push(e), abortController.signal);

      // 2 content events + 1 done event (finalized exactly once)
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'token', content: 'Hello' });
      expect(events[1]).toEqual({ type: 'token', content: ' world' });
      expect(events[2]).toEqual({
        type: 'done',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
    });

    it('sends the conversation system prompt and requests streaming usage', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: [DONE]\n\n']),
      });

      await adapter.stream(
        { ...mockRequest, systemPrompt: 'Answer briefly.' },
        vi.fn(),
        abortController.signal,
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        messages: { role: string; content?: string }[];
        stream_options?: { include_usage: boolean };
      };
      expect(body.messages[0]).toEqual({ role: 'system', content: 'Answer briefly.' });
      expect(body.stream_options).toEqual({ include_usage: true });
    });

    it('omits temperature, top_p, and penalty parameters for reasoning models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: [DONE]\n\n']),
      });

      await adapter.stream(
        { ...mockRequest, model: 'o1', temperature: 0.9, topP: 0.8, frequencyPenalty: 0.5, presencePenalty: 0.5 },
        vi.fn(),
        abortController.signal,
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.temperature).toBeUndefined();
      expect(body.top_p).toBeUndefined();
      expect(body.frequency_penalty).toBeUndefined();
      expect(body.presence_penalty).toBeUndefined();
    });

    it('handles tool calls in stream', async () => {
      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{\\"location\\":\\"NYC\\"}"}}]},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(mockRequest, (e) => events.push(e), abortController.signal);

      // tool_call comes first, then single done event
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('tool_call');
      expect(events[0].toolCalls).toHaveLength(1);
      expect(events[0].toolCalls![0]).toEqual({
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
      });
      expect(events[1]).toEqual({ type: 'done' });
    });

    it('throws ProviderAuthError on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderAuthError);
    });

    it('throws ProviderRateLimitError on 429 with retry-after', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => '60' },
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Rate limit exceeded' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderRateLimitError);
    });

    it('throws ProviderServerError on 500', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Internal server error' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderServerError);
    });

    it('throws ProviderServerError on non-JSON response text', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve('<html>502 Bad Gateway</html>'),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderServerError);
    });

    it('throws ProviderServerError on default unhandled status code', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Bad request' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderServerError);
    });

    it('handles 429 without retry-after header', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Rate limit' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderRateLimitError);
    });

    it('throws ProviderNetworkError on network failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderNetworkError);
    });

    it('throws ProviderCancelledError when aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      mockFetch.mockImplementation(() => {
        throw new DOMException('Aborted', 'AbortError');
      });

      await expect(adapter.stream(mockRequest, vi.fn(), controller.signal)).rejects.toThrow(ProviderCancelledError);
    });

    it('handles malformed stream gracefully', async () => {
      const chunks = [
        'data: not valid json\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(mockRequest, (e) => events.push(e), abortController.signal);

      // Should still process valid chunks
      expect(events.some((e) => e.type === 'token' && e.content === 'Hello')).toBe(true);
    });

    it('cleans up abort listeners when signal is aborted mid-flight', async () => {
      const controller = new AbortController();
      mockFetch.mockImplementation(async () => {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      });

      await expect(adapter.stream(mockRequest, vi.fn(), controller.signal)).rejects.toThrow(ProviderCancelledError);
    });

    it('emits done event if stream ends without [DONE] marker or finish_reason', async () => {
      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(mockRequest, (e) => events.push(e), abortController.signal);

      expect(events.some((e) => e.type === 'token' && e.content === 'Hi')).toBe(true);
      expect(events.some((e) => e.type === 'done')).toBe(true);
    });

    it('includes usage in done event when finish_reason and usage are in same chunk', async () => {
      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":4,"total_tokens":12}}\n\n',
        'data: [DONE]\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(mockRequest, (e) => events.push(e), abortController.signal);

      // Should have token + done with usage
      expect(events.some((e) => e.type === 'token')).toBe(true);
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.usage).toEqual({
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
      });
    });

    it('returns default contextWindow, capabilities, and pricing for unknown model', () => {
      const adapterAny = adapter as unknown as {
        getContextWindow: (m: string) => number;
        getCapabilities: (m: string) => unknown;
        getPricing: (m: string) => unknown;
      };
      expect(adapterAny.getContextWindow('unknown')).toBe(128_000);
      expect(adapterAny.getCapabilities('unknown')).toEqual(expect.objectContaining({ streaming: true }));
      expect(adapterAny.getPricing('unknown')).toEqual({ inputPerMillion: 0, outputPerMillion: 0 });
    });

    it('handles error response without error object in JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        text: () => Promise.resolve('{}'),
      });

      await expect(adapter.chat(mockRequest, abortController.signal)).rejects.toThrow('HTTP 400');
    });
  });

  describe('chat (non-streaming)', () => {
    const mockMessages: NormalizedMessage[] = [
      { role: 'user', content: 'Hello' },
    ];

    const mockRequest: ChatRequest = {
      messages: mockMessages,
      model: 'gpt-4o',
      provider: 'openai',
      stream: false,
    };

    it('returns normalized message for successful response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'gpt-4o',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello world',
            },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const result = await adapter.chat(mockRequest, abortController.signal);

      expect(result).toEqual({
        role: 'assistant',
        content: 'Hello world',
        toolCalls: undefined,
        toolCallId: undefined,
        extra: { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
      });
    });

    it('handles tool calls in non-streaming response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'gpt-4o',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const result = await adapter.chat(mockRequest, abortController.signal);

      expect(result).toEqual({
        role: 'assistant',
        content: null,
        toolCalls: [{
          id: 'call_123',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
        }],
        toolCallId: undefined,
        extra: { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
      });
    });

    it('converts tool messages and image attachments in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'gpt-4o',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Got it' },
            finish_reason: 'stop',
          }],
        }),
      });

      const complexRequest = {
        model: 'gpt-4o' as const,
        provider: 'openai' as const,
        messages: [
          {
            role: 'user' as const,
            content: 'Check image',
            attachments: [
              { type: 'image' as const, path: 'img_base64', mimeType: 'image/png' },
              { type: 'image' as const, path: 'data:image/png;base64,abc', mimeType: 'image/png' },
            ],
          },
          { role: 'assistant' as const, content: null, toolCalls: [{ id: 'c1', type: 'function' as const, function: { name: 'f', arguments: '{}' } }] },
          { role: 'tool' as const, content: 'tool result', toolCallId: 'c1' },
        ],
      };

      const result = await adapter.chat(complexRequest, abortController.signal);
      expect(result.content).toBe('Got it');
    });

    it('handles content blocks and non-assistant role in convertResponse', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            index: 0,
            message: {
              role: 'user',
              content: [
                { type: 'text', text: 'part1' },
                { type: 'other', text: 'ignored' },
              ],
            },
          }],
        }),
      });

      const res = await adapter.chat(mockRequest, abortController.signal);
      expect(res.role).toBe('user');
      expect(res.content).toBe('part1');
    });
    it('throws when choices array is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'gpt-4o',
          choices: [],
        }),
      });

      await expect(
        adapter.chat({ messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' }, abortController.signal),
      ).rejects.toThrow(ProviderMalformedStreamError);
    });

    it('handles AbortError in chat', async () => {
      mockFetch.mockImplementation(() => {
        throw new DOMException('Aborted', 'AbortError');
      });

      await expect(
        adapter.chat({ messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' }, abortController.signal),
      ).rejects.toThrow(ProviderCancelledError);
    });

    it('handles unexpected errors in chat', async () => {
      mockFetch.mockImplementation(() => {
        throw new Error('Socket closed abruptly');
      });

      await expect(
        adapter.chat({ messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' }, abortController.signal),
      ).rejects.toThrow(ProviderNetworkError);
    });

    it('covers convertMessage and cancel edge branches', async () => {
      adapter.cancel(); // when abortController is null

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        }),
      });

      const req: ChatRequest = {
        model: 'gpt-4o',
        provider: 'openai',
        messages: [
          { role: 'system', content: 'system instructions' },
          { role: 'tool', content: null, toolCallId: 't1' },
        ],
      };

      await adapter.chat(req, abortController.signal);
    });

    it('handles non-Error thrown in listModels', async () => {
      mockFetch.mockRejectedValue('String network error');
      await expect(adapter.listModels(abortController.signal)).rejects.toThrow('Failed to list models: String network error');
    });

    it('cancels in-flight request when adapter.cancel() is called', async () => {
      mockFetch.mockImplementation(async () => {
        adapter.cancel();
        throw new DOMException('Aborted', 'AbortError');
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderCancelledError);
    });

    it('handles non-Error thrown in stream and chat', async () => {
      mockFetch.mockRejectedValue('raw stream error');
      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow('Unexpected error: raw stream error');

      mockFetch.mockRejectedValue(new Error('Generic stream crash'));
      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow('Unexpected error: Generic stream crash');

      mockFetch.mockRejectedValue('raw chat error');
      await expect(adapter.chat(mockRequest, abortController.signal)).rejects.toThrow('Unexpected error: raw chat error');
    });

    it('handles non-AbortError DOMException and generic TypeError', async () => {
      mockFetch.mockRejectedValue(new DOMException('Other DOM error', 'QuotaExceededError'));
      await expect(adapter.chat(mockRequest, abortController.signal)).rejects.toThrow('Unexpected error: Other DOM error');

      mockFetch.mockRejectedValue(new DOMException('Other stream DOM error', 'QuotaExceededError'));
      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow('Unexpected error: Other stream DOM error');

      mockFetch.mockRejectedValue(new TypeError('Generic type error without target word'));
      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow('Unexpected error: Generic type error without target word');
    });

    it('throws ProviderAuthError in chat when api key is missing', async () => {
      const noKeyAdapter = new OpenAIAdapter({ getKey: vi.fn().mockResolvedValue(undefined) });
      await expect(
        noKeyAdapter.chat({ messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' }, abortController.signal),
      ).rejects.toThrow(ProviderAuthError);
    });

    it('throws ProviderAuthError in stream when api key is missing', async () => {
      const noKeyAdapter = new OpenAIAdapter({ getKey: vi.fn().mockResolvedValue(undefined) });
      await expect(
        noKeyAdapter.stream({ messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' }, vi.fn(), abortController.signal),
      ).rejects.toThrow(ProviderAuthError);
    });

    it('aborts controller when an input signal aborts during active request', async () => {
      const source = new AbortController();
      mockFetch.mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const promise = adapter.chat(
        { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
        source.signal,
      );
      source.abort();
      await expect(promise).rejects.toThrow(ProviderCancelledError);
    });

    it('uses explicitly set api key via setApiKey', async () => {
      const customAdapter = new OpenAIAdapter({ getKey: vi.fn().mockResolvedValue(undefined) });
      await customAdapter.setApiKey('sk-explicit-key');
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ index: 0, message: { role: 'assistant', content: 'Explicit key works' } }],
        }),
      });

      const response = await customAdapter.chat(
        { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
        abortController.signal,
      );
      expect(response.content).toBe('Explicit key works');
    });

    it('handles pre-aborted signal in stream and chat', async () => {
      const preAborted = AbortSignal.abort();
      mockFetch.mockImplementation((_url, options) => {
        if (options?.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        return Promise.resolve({ ok: true, body: null });
      });

      await expect(
        adapter.stream(
          { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
          vi.fn(),
          preAborted,
        ),
      ).rejects.toThrow(ProviderCancelledError);

      await expect(
        adapter.chat(
          { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
          preAborted,
        ),
      ).rejects.toThrow(ProviderCancelledError);
    });

    it('handles HTTP error responses in chat', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key' } })),
      });

      await expect(
        adapter.chat({ messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' }, abortController.signal),
      ).rejects.toThrow(ProviderAuthError);
    });
  });

  describe('listModels', () => {
    it('returns filtered model list', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'gpt-4o', object: 'model', created: 1234567890, owned_by: 'openai' },
            { id: 'gpt-4o-mini', object: 'model', created: 1234567890, owned_by: 'openai' },
            { id: 'unknown-model', object: 'model', created: 1234567890, owned_by: 'openai' },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini']);
      expect(models[0]).toMatchObject({
        id: 'gpt-4o',
        provider: 'openai',
        contextWindow: 128000,
        capabilities: expect.objectContaining({ vision: true, toolCalling: true, streaming: true }),
      });
    });

    it('throws ProviderAuthError if api key is missing', async () => {
      const noKeyAdapter = new OpenAIAdapter({ getKey: vi.fn().mockResolvedValue(null) });
      await expect(noKeyAdapter.listModels(abortController.signal)).rejects.toThrow(ProviderAuthError);
    });

    it('handles HTTP error response when listing models', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid token' } })),
      });
      await expect(adapter.listModels(abortController.signal)).rejects.toThrow(ProviderNetworkError);
    });

    it('throws ProviderNetworkError when listModels fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));
      await expect(adapter.listModels(abortController.signal)).rejects.toThrow(ProviderNetworkError);
    });
  });

  describe('stream error handling and edge cases', () => {
    it('throws ProviderMalformedStreamError when response body is null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: null,
      });

      await expect(
        adapter.stream(
          { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
          vi.fn(),
          abortController.signal,
        ),
      ).rejects.toThrow(ProviderMalformedStreamError);
    });

    it('handles TypeError with fetch in stream', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(
        adapter.stream(
          { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
          vi.fn(),
          abortController.signal,
        ),
      ).rejects.toThrow(ProviderNetworkError);
    });

    it('handles unexpected errors in stream', async () => {
      mockFetch.mockRejectedValue('Unknown error object');

      await expect(
        adapter.stream(
          { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
          vi.fn(),
          abortController.signal,
        ),
      ).rejects.toThrow(ProviderNetworkError);
    });

    it('handles malformed JSON chunks and empty choices in stream', async () => {
      const chunks = [
        'data: {invalid-json\n\n',
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[]}\n\n',
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const createMockStream = (streamChunks: string[]) => {
        let index = 0;
        return new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (index < streamChunks.length) {
              controller.enqueue(new TextEncoder().encode(streamChunks[index++]));
            } else {
              controller.close();
            }
          },
        });
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(
        { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
        (e) => events.push(e),
        abortController.signal,
      );

      expect(events).toHaveLength(1); // exactly one done event emitted
    });

    it('handles tool calls without id and filters incomplete tool calls in stream', async () => {
      const chunks = [
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"type":"function","function":{"name":"search","arguments":"{}"}},{"index":1,"type":"function","function":{}}]},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const createMockStream = (streamChunks: string[]) => {
        let index = 0;
        return new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (index < streamChunks.length) {
              controller.enqueue(new TextEncoder().encode(streamChunks[index++]));
            } else {
              controller.close();
            }
          },
        });
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(
        { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
        (e) => events.push(e),
        abortController.signal,
      );

      expect(events[0].type).toBe('tool_call');
      expect(events[0].toolCalls![0].id).toBe('call_0');
    });

    it('handles rate limit and server errors in handleErrorResponse', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '5' }),
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Too many requests' } })),
      });

      await expect(
        adapter.stream(
          { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
          vi.fn(),
          abortController.signal,
        ),
      ).rejects.toThrow(ProviderRateLimitError);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: () => Promise.resolve('Internal server error non-json'),
      });

      await expect(
        adapter.stream(
          { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
          vi.fn(),
          abortController.signal,
        ),
      ).rejects.toThrow(ProviderServerError);
    });
  });

  describe('cancel', () => {
    it('aborts ongoing request', async () => {
      const controller = new AbortController();
      controller.abort();

      mockFetch.mockImplementation(() => {
        throw new DOMException('Aborted', 'AbortError');
      });

      await expect(
        adapter.stream(
          { messages: [{ role: 'user', content: 'test' }], model: 'gpt-4o', provider: 'openai' },
          vi.fn(),
          controller.signal,
        ),
      ).rejects.toThrow(ProviderCancelledError);
    });
  });
});
