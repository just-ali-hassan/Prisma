/**
 * Fireworks AI Adapter Tests
 *
 * Tests for the Fireworks AI adapter with mocked API responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FireworksAdapter } from '../fireworks.adapter';
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
  getKey: vi.fn().mockResolvedValue('fireworks-test-key-12345678901234567890123456789012345678901234'),
};

describe('FireworksAdapter', () => {
  let adapter: FireworksAdapter;
  let abortController: AbortController;
  const mockMessages: NormalizedMessage[] = [
    { role: 'user', content: 'Hello' },
  ];
  const mockRequest: ChatRequest = {
    messages: mockMessages,
    model: 'llama-v3p1-70b-instruct',
    provider: 'fireworks',
    stream: true,
  };

  beforeEach(() => {
    abortController = new AbortController();
    vi.clearAllMocks();
    adapter = new FireworksAdapter(mockKeyManager);
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

    it('streams tokens correctly for a successful response', async () => {
      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-v3p1-70b-instruct","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-v3p1-70b-instruct","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-v3p1-70b-instruct","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-v3p1-70b-instruct","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(mockRequest, (e) => events.push(e), abortController.signal);

      // 2 content tokens + 1 done event (finish_reason chunk doesn't emit token)
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'token', content: 'Hello' });
      expect(events[1]).toEqual({ type: 'token', content: ' world' });
      expect(events[2]).toEqual({
        type: 'done',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
    });

    it('handles tool calls in stream', async () => {
      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-v3p1-70b-instruct","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{\\\"location\\\":\\\"NYC\\\"}"}}]},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-v3p1-70b-instruct","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(mockRequest, (e) => events.push(e), abortController.signal);

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
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key', type: 'authentication_error' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderAuthError);
    });

    it('throws ProviderRateLimitError on 429 with retry-after', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => '60' },
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderRateLimitError);
    });

    it('throws ProviderServerError on 500', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Internal server error', type: 'api_error' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderServerError);
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
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-v3p1-70b-instruct","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: [DONE]\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(mockRequest, (e) => events.push(e), abortController.signal);

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

    it('emits done event if stream ends without [DONE] marker', async () => {
      const chunks = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"llama-v3p1-70b-instruct","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
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

    it('includes system prompt in request', async () => {
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
      };
      expect(body.messages[0]).toEqual({ role: 'system', content: 'Answer briefly.' });
    });

    it('includes tools in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: [DONE]\n\n']),
      });

      const toolsRequest = {
        ...mockRequest,
        tools: [{
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather for a location',
            parameters: { type: 'object', properties: { location: { type: 'string' } } },
          },
        }],
      };

      await adapter.stream(toolsRequest, vi.fn(), abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        tools: { type: string; function: { name: string; description: string; parameters: unknown } }[];
      };
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0]).toMatchObject({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather for a location',
          parameters: { type: 'object', properties: { location: { type: 'string' } } },
        },
      });
    });

    it('handles toolChoice: auto', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: [DONE]\n\n']),
      });

      const autoRequest = {
        ...mockRequest,
        toolChoice: 'auto' as const,
      };

      await adapter.stream(autoRequest, vi.fn(), abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        tool_choice?: string;
      };
      expect(body.tool_choice).toBe('auto');
    });

    it('handles toolChoice: none', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: [DONE]\n\n']),
      });

      const noneRequest = {
        ...mockRequest,
        toolChoice: 'none' as const,
      };

      await adapter.stream(noneRequest, vi.fn(), abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        tool_choice?: string;
      };
      expect(body.tool_choice).toBe('none');
    });
  });

  describe('chat (non-streaming)', () => {
    const mockMessages: NormalizedMessage[] = [
      { role: 'user', content: 'Hello' },
    ];

    const mockRequest: ChatRequest = {
      messages: mockMessages,
      model: 'llama-v3p1-70b-instruct',
      provider: 'fireworks',
      stream: false,
    };

    it('returns normalized message for successful response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'llama-v3p1-70b-instruct',
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
          model: 'llama-v3p1-70b-instruct',
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

    it('converts tool messages in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'llama-v3p1-70b-instruct',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Got it' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const complexRequest = {
        model: 'llama-v3p1-70b-instruct' as const,
        provider: 'fireworks' as const,
        messages: [
          { role: 'user' as const, content: 'Hello' },
          {
            role: 'assistant' as const,
            content: null,
            toolCalls: [{
              id: 'call_123',
              type: 'function' as const,
              function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
            }],
          },
          {
            role: 'tool' as const,
            content: 'Sunny',
            toolCallId: 'call_123',
          },
        ],
        stream: false,
      };

      await adapter.chat(complexRequest, abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        messages: { role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string }[];
      };
      expect(body.messages[1].tool_calls).toBeDefined();
      expect(body.messages[2]).toMatchObject({
        role: 'tool',
        content: 'Sunny',
        tool_call_id: 'call_123',
      });
    });

    it('throws ProviderAuthError on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key', type: 'authentication_error' } })),
      });

      await expect(adapter.chat(mockRequest, abortController.signal)).rejects.toThrow(ProviderAuthError);
    });

    it('throws ProviderNetworkError on network failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(adapter.chat(mockRequest, abortController.signal)).rejects.toThrow(ProviderNetworkError);
    });

    it('throws ProviderCancelledError on AbortError', async () => {
      const controller = new AbortController();
      controller.abort();

      mockFetch.mockImplementation(() => {
        throw new DOMException('Aborted', 'AbortError');
      });

      await expect(adapter.chat(mockRequest, controller.signal)).rejects.toThrow(ProviderCancelledError);
    });
  });

  describe('listModels', () => {
    it('returns list of models with capabilities and pricing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'llama-v3p1-405b-instruct', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 128000, display_name: 'Llama 3.1 405B Instruct', type: 'chat' },
            { id: 'llama-v3p1-70b-instruct', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 128000, display_name: 'Llama 3.1 70B Instruct', type: 'chat' },
            { id: 'llama-v3p1-8b-instruct', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 128000, display_name: 'Llama 3.1 8B Instruct', type: 'chat' },
            { id: 'mixtral-8x7b-instruct', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 32768, display_name: 'Mixtral 8x7B Instruct', type: 'chat' },
            { id: 'qwen2p5-72b-instruct', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 131072, display_name: 'Qwen 2.5 72B Instruct', type: 'chat' },
            { id: 'qwen2p5-coder-32b-instruct', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 131072, display_name: 'Qwen 2.5 Coder 32B Instruct', type: 'chat' },
            { id: 'deepseek-r1', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 131072, display_name: 'DeepSeek R1', type: 'chat' },
            { id: 'deepseek-v3', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 131072, display_name: 'DeepSeek V3', type: 'chat' },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(8);
      expect(models[0]).toMatchObject({
        id: 'llama-v3p1-405b-instruct',
        provider: 'fireworks',
        name: 'Llama 3.1 405B Instruct',
        contextWindow: 128_000,
        capabilities: { vision: false, video: false, toolCalling: true, fileInput: false, streaming: true },
        pricing: { inputPerMillion: 1.2, outputPerMillion: 1.2 },
      });
      expect(models[6]).toMatchObject({
        id: 'deepseek-r1',
        provider: 'fireworks',
        name: 'DeepSeek R1',
        contextWindow: 131_072,
        capabilities: { vision: false, video: false, toolCalling: true, fileInput: false, streaming: true, reasoning: true },
        pricing: { inputPerMillion: 0.14, outputPerMillion: 2.19 },
      });
    });

    it('filters out unsupported models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'llama-v3p1-405b-instruct', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 128000, display_name: 'Llama 3.1 405B Instruct', type: 'chat' },
            { id: 'unsupported-model', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 16384, display_name: 'Unsupported Model', type: 'chat' },
            { id: 'llama-v3p1-70b-instruct', object: 'model', created: 1234567890, owned_by: 'fireworks', context_length: 128000, display_name: 'Llama 3.1 70B Instruct', type: 'chat' },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(['llama-v3p1-405b-instruct', 'llama-v3p1-70b-instruct']);
    });

    it('throws ProviderNetworkError on network failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(adapter.listModels(abortController.signal)).rejects.toThrow(ProviderNetworkError);
    });

    it('throws ProviderNetworkError on server error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Server error', type: 'api_error' } })),
      });

      await expect(adapter.listModels(abortController.signal)).rejects.toThrow(ProviderNetworkError);
    });
  });

  describe('cancel', () => {
    it('aborts ongoing request', async () => {
      let abortHandler: (() => void) | null = null;

      mockFetch.mockImplementation(async () => {
        await new Promise<void>((resolve, reject) => {
          abortHandler = () => {
            reject(new DOMException('Aborted', 'AbortError'));
          };
        });
      });

      const sendPromise = adapter.stream(mockRequest, vi.fn(), abortController.signal);
      await new Promise((r) => setTimeout(r, 10));
      adapter.cancel();

      if (abortHandler) abortHandler();

      await expect(sendPromise).rejects.toThrow(ProviderCancelledError);
    });
  });

  describe('provider metadata', () => {
    it('has correct providerId', () => {
      expect(adapter.providerId).toBe('fireworks');
    });

    it('has correct supportedModels', () => {
      expect(adapter.supportedModels).toEqual([
        'llama-v3p1-405b-instruct',
        'llama-v3p1-70b-instruct',
        'llama-v3p1-8b-instruct',
        'mixtral-8x7b-instruct',
        'qwen2p5-72b-instruct',
        'qwen2p5-coder-32b-instruct',
        'deepseek-r1',
        'deepseek-v3',
      ]);
    });
  });
});