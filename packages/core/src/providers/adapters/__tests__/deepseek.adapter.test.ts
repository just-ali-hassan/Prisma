/**
 * DeepSeek Adapter Tests
 *
 * Tests for the DeepSeek adapter with mocked API responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepSeekAdapter } from '../deepseek.adapter';
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
  getKey: vi.fn().mockResolvedValue('sk-deepseek-test-key-12345678901234567890123456789012345678901234'),
};

describe('DeepSeekAdapter', () => {
  let adapter: DeepSeekAdapter;
  let abortController: AbortController;
  const mockMessages: NormalizedMessage[] = [
    { role: 'user', content: 'Hello' },
  ];
  const mockRequest: ChatRequest = {
    messages: mockMessages,
    model: 'deepseek-chat',
    provider: 'deepseek',
    stream: true,
  };

  beforeEach(() => {
    abortController = new AbortController();
    vi.clearAllMocks();
    adapter = new DeepSeekAdapter(mockKeyManager);
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
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
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
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{\\"location\\":\\"NYC\\"}"}}]},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
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
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
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
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
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

    it('handles image attachments by adding description', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: [DONE]\n\n']),
      });

      const complexRequest = {
        model: 'deepseek-chat' as const,
        provider: 'deepseek' as const,
        messages: [
          {
            role: 'user' as const,
            content: 'Check image',
            attachments: [
              { type: 'image' as const, path: 'img_base64', mimeType: 'image/png', filename: 'test.png' },
            ],
          },
        ],
        stream: true,
      };

      await adapter.stream(complexRequest, vi.fn(), abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        messages: { role: string; content?: string }[];
      };
      expect(body.messages[0].content).toContain('[Image: test.png (image/png)]');
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
      model: 'deepseek-chat',
      provider: 'deepseek',
      stream: false,
    };

    it('returns normalized message for successful response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'deepseek-chat',
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
          model: 'deepseek-chat',
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
          model: 'deepseek-v3',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Got it' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const complexRequest = {
        model: 'deepseek-chat' as const,
        provider: 'deepseek' as const,
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
            { id: 'deepseek-chat', type: 'model', display_name: 'DeepSeek Chat', created_at: '2024-01-01T00:00:00Z' },
            { id: 'deepseek-reasoner', type: 'model', display_name: 'DeepSeek Reasoner', created_at: '2024-01-01T00:00:00Z' },
            { id: 'deepseek-coder', type: 'model', display_name: 'DeepSeek Coder', created_at: '2024-01-01T00:00:00Z' },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(2);
      expect(models[0]).toMatchObject({
        id: 'deepseek-chat',
        provider: 'deepseek',
        name: 'deepseek-chat',
        contextWindow: 128_000,
        capabilities: { vision: false, video: false, toolCalling: true, fileInput: false, streaming: true },
        pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28 },
      });
    });

    it('filters out unsupported models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'deepseek-chat', type: 'model', display_name: 'DeepSeek Chat', created_at: '2024-01-01T00:00:00Z' },
            { id: 'deepseek-coder', type: 'model', display_name: 'DeepSeek Coder', created_at: '2024-01-01T00:00:00Z' },
            { id: 'deepseek-reasoner', type: 'model', display_name: 'DeepSeek Reasoner', created_at: '2024-01-01T00:00:00Z' },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(['deepseek-chat', 'deepseek-reasoner']);
    });

    it('throws ProviderNetworkError on network failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(adapter.listModels(abortController.signal)).rejects.toThrow(ProviderNetworkError);
    });

    it('throws ProviderServerError on server error', async () => {
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
      expect(adapter.providerId).toBe('deepseek');
    });

    it('has correct supportedModels', () => {
      expect(adapter.supportedModels).toEqual([
        'deepseek-chat',
        'deepseek-reasoner',
      ]);
    });
  });
});