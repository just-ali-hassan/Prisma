/**
 * OpenRouter Adapter Tests
 *
 * Tests for the OpenRouter adapter with mocked API responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterAdapter } from '../openrouter.adapter';
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
  getKey: vi.fn().mockResolvedValue('sk-or-test-key-12345678901234567890123456789012345678901234'),
};

describe('OpenRouterAdapter', () => {
  let adapter: OpenRouterAdapter;
  let abortController: AbortController;
  const mockMessages: NormalizedMessage[] = [
    { role: 'user', content: 'Hello' },
  ];
  const mockRequest: ChatRequest = {
    messages: mockMessages,
    model: 'openrouter:auto',
    provider: 'openrouter',
    stream: true,
  };

  beforeEach(() => {
    abortController = new AbortController();
    vi.clearAllMocks();
    adapter = new OpenRouterAdapter(mockKeyManager);
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
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"openrouter:auto","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"openrouter:auto","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"openrouter:auto","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"openrouter:auto","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
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
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"openrouter:auto","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{\\"location\\":\\"NYC\\"}"}}]},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"openrouter:auto","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
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
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"openrouter:auto","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
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
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"openrouter:auto","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
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

    it('includes HTTP-Referer and X-Title headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: [DONE]\n\n']),
      });

      await adapter.stream(mockRequest, vi.fn(), abortController.signal);

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers).toMatchObject({
        'HTTP-Referer': 'https://prisma.ai',
        'X-Title': 'Prisma',
      });
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
      model: 'openrouter:auto',
      provider: 'openrouter',
      stream: false,
    };

    it('returns normalized message for successful response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'openrouter:auto',
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
          model: 'openrouter:auto',
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
          model: 'openrouter:auto',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Got it' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const complexRequest = {
        model: 'openrouter:auto' as const,
        provider: 'openrouter' as const,
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
            { id: 'openrouter/auto', name: 'OpenRouter Auto', created: 1234567890, description: 'Auto routing', context_length: 128000, architecture: { modality: 'text', tokenizer: 'cl100k_base', instruct_type: null }, top_provider: { is_moderated: false, context_length: 128000, max_completion_tokens: 4096 }, pricing: { prompt: '0', completion: '0' } },
            { id: 'openrouter/gpt-4o', name: 'GPT-4o via OpenRouter', created: 1234567890, description: 'GPT-4o', context_length: 128000, architecture: { modality: 'text', tokenizer: 'cl100k_base', instruct_type: null }, top_provider: { is_moderated: false, context_length: 128000, max_completion_tokens: 4096 }, pricing: { prompt: '2.5', completion: '10' } },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(2);
      expect(models[0]).toMatchObject({
        id: 'openrouter/auto',
        provider: 'openrouter',
        name: 'OpenRouter Auto',
        contextWindow: 128000,
        capabilities: { vision: true, video: false, toolCalling: true, fileInput: true, streaming: true },
        pricing: { inputPerMillion: 0, outputPerMillion: 0 },
      });
    });

    it('filters out unsupported models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'openrouter/auto', name: 'OpenRouter Auto', created: 1234567890, description: 'Auto routing', context_length: 128000, architecture: { modality: 'text', tokenizer: 'cl100k_base', instruct_type: null }, top_provider: { is_moderated: false, context_length: 128000, max_completion_tokens: 4096 }, pricing: { prompt: '0', completion: '0' } },
            { id: 'anthropic/claude-3', name: 'Claude 3', created: 1234567890, description: 'Claude', context_length: 200000, architecture: { modality: 'text', tokenizer: 'cl100k_base', instruct_type: null }, top_provider: { is_moderated: false, context_length: 200000, max_completion_tokens: 4096 }, pricing: { prompt: '3', completion: '15' } },
            { id: 'openrouter/gpt-4o', name: 'GPT-4o via OpenRouter', created: 1234567890, description: 'GPT-4o', context_length: 128000, architecture: { modality: 'text', tokenizer: 'cl100k_base', instruct_type: null }, top_provider: { is_moderated: false, context_length: 128000, max_completion_tokens: 4096 }, pricing: { prompt: '2.5', completion: '10' } },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(['openrouter/auto', 'openrouter/gpt-4o']);
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
      expect(adapter.providerId).toBe('openrouter');
    });

    it('has correct supportedModels', () => {
      expect(adapter.supportedModels).toEqual([
        'openrouter:auto',
      ]);
    });
  });
});