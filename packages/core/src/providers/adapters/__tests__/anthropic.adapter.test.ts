/**
 * Anthropic Adapter Tests
 *
 * Tests for the Anthropic adapter with mocked API responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicAdapter } from '../anthropic.adapter';
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
  getKey: vi.fn().mockResolvedValue('sk-ant-test-key-12345678901234567890123456789012345678901234'),
};

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;
  let abortController: AbortController;
  const mockMessages: NormalizedMessage[] = [
    { role: 'user', content: 'Hello' },
  ];
  const mockRequest: ChatRequest = {
    messages: mockMessages,
    model: 'claude-sonnet-5-5',
    provider: 'anthropic',
    stream: true,
  };

  beforeEach(() => {
    abortController = new AbortController();
    vi.clearAllMocks();
    adapter = new AnthropicAdapter(mockKeyManager);
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
        'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-5-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":10,"output_tokens":5}}\n\n',
        'data: {"type":"message_stop"}\n\n',
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

    it('handles tool calls in stream', async () => {
      const chunks = [
        'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-5-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_123","name":"get_weather","input":{}}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\\"location\\":\\"NYC\\"}"}}\n\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"input_tokens":10,"output_tokens":5}}\n\n',
        'data: {"type":"message_stop"}\n\n',
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
      expect(events[1]).toEqual({ type: 'done', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
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
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Bad request', type: 'invalid_request_error' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderServerError);
    });

    it('handles 429 without retry-after header', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Rate limit', type: 'rate_limit_error' } })),
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
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":10,"output_tokens":5}}\n\n',
        'data: {"type":"message_stop"}\n\n',
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

    it('emits done event if stream ends without message_stop', async () => {
      const chunks = [
        'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-5-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":10,"output_tokens":5}}\n\n',
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

    it('handles error event in stream', async () => {
      const chunks = [
        'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-5-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
        'data: {"type":"error","error":{"type":"api_error","message":"Overloaded"}}\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderServerError);
    });

    it('handles invalid JSON in tool call arguments', async () => {
      const chunks = [
        'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-sonnet-5-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_123","name":"get_weather","input":{}}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"invalid json"}}\n\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"input_tokens":10,"output_tokens":5}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(mockRequest, (e) => events.push(e), abortController.signal);

      // Should not emit tool_call due to invalid JSON, but should emit done
      expect(events.some((e) => e.type === 'tool_call')).toBe(false);
      expect(events.some((e) => e.type === 'done')).toBe(true);
    });

    it('includes system prompt in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: {"type":"message_stop"}\n\n']),
      });

      await adapter.stream(
        { ...mockRequest, systemPrompt: 'Answer briefly.' },
        vi.fn(),
        abortController.signal,
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        system?: string;
        messages: { role: string; content?: string }[];
      };
      expect(body.system).toBe('Answer briefly.');
    });

    it('handles image attachments in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: {"type":"message_stop"}\n\n']),
      });

      const complexRequest = {
        model: 'claude-sonnet-5-5' as const,
        provider: 'anthropic' as const,
        messages: [
          {
            role: 'user' as const,
            content: 'Check image',
            attachments: [
              { type: 'image' as const, path: 'img_base64', mimeType: 'image/png' },
              { type: 'image' as const, path: 'data:image/png;base64,abc', mimeType: 'image/png' },
            ],
          },
        ],
        stream: true,
      };

      await adapter.stream(complexRequest, vi.fn(), abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        messages: { role: string; content: (string | { type: string; text?: string; source?: { type: string; media_type: string; data: string } })[] };
      };
      expect(body.messages[0].content).toBeInstanceOf(Array);
      const imageBlocks = (body.messages[0].content as Array<{ type: string }>).filter((b) => b.type === 'image');
      expect(imageBlocks).toHaveLength(2);
    });

    it('includes tools with description in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: {"type":"message_stop"}\n\n']),
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
        tools: { name: string; description: string; input_schema: unknown }[];
      };
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0]).toMatchObject({
        name: 'get_weather',
        description: 'Get weather for a location',
        input_schema: { type: 'object', properties: { location: { type: 'string' } } },
      });
    });

    it('handles tool_choice: none (falls back to auto for Anthropic)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: {"type":"message_stop"}\n\n']),
      });

      const noneRequest = {
        ...mockRequest,
        toolChoice: 'none' as const,
      };

      await adapter.stream(noneRequest, vi.fn(), abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        tool_choice?: { type: string };
      };
      // Anthropic doesn't support 'none', so it falls back to 'auto'
      expect(body.tool_choice).toEqual({ type: 'auto' });
    });

    it('handles tool_choice: function', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: {"type":"message_stop"}\n\n']),
      });

      const functionRequest = {
        ...mockRequest,
        toolChoice: { type: 'function' as const, function: { name: 'get_weather' } },
      };

      await adapter.stream(functionRequest, vi.fn(), abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        tool_choice?: { type: string; name: string };
      };
      expect(body.tool_choice).toEqual({ type: 'tool', name: 'get_weather' });
    });

    it('throws ProviderNetworkError on listModels error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Server error', type: 'api_error' } })),
      });

      await expect(adapter.listModels(abortController.signal)).rejects.toThrow(ProviderNetworkError);
    });

    it('throws ProviderCancelledError on AbortError in chat', async () => {
      const controller = new AbortController();
      controller.abort();

      mockFetch.mockImplementation(() => {
        throw new DOMException('Aborted', 'AbortError');
      });

      await expect(adapter.chat(mockRequest, controller.signal)).rejects.toThrow(ProviderCancelledError);
    });
  });

  describe('chat (non-streaming)', () => {
    const mockMessages: NormalizedMessage[] = [
      { role: 'user', content: 'Hello' },
    ];

    const mockRequest: ChatRequest = {
      messages: mockMessages,
      model: 'claude-sonnet-5-5',
      provider: 'anthropic',
      stream: false,
    };

    it('returns normalized message for successful response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Hello world' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const result = await adapter.chat(mockRequest, abortController.signal);

      expect(result).toEqual({
        role: 'assistant',
        content: 'Hello world',
        toolCalls: undefined,
        toolCallId: undefined,
        extra: { usage: { input_tokens: 10, output_tokens: 5 } },
      });
    });

    it('handles tool calls in non-streaming response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [
            { type: 'tool_use', id: 'call_123', name: 'get_weather', input: { location: 'NYC' } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 10, output_tokens: 5 },
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
        extra: { usage: { input_tokens: 10, output_tokens: 5 } },
      });
    });

    it('converts tool messages and image attachments in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Got it' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const complexRequest = {
        model: 'claude-sonnet-5-5' as const,
        provider: 'anthropic' as const,
        messages: [
          {
            role: 'user' as const,
            content: 'Check image',
            attachments: [
              { type: 'image' as const, path: 'img_base64', mimeType: 'image/png' },
              { type: 'image' as const, path: 'data:image/png;base64,abc', mimeType: 'image/png' },
            ],
          },
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
        messages: { role: string; content: (string | { type: string; text?: string; source?: { type: string; media_type: string; data: string } })[] }[];
      };
      expect(body.messages[0].content).toBeInstanceOf(Array);
      const imageBlocks = (body.messages[0].content as Array<{ type: string }>).filter((b) => b.type === 'image');
      expect(imageBlocks).toHaveLength(2);
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
  });

  describe('listModels', () => {
    it('returns list of models with capabilities and pricing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'claude-opus-5-5', type: 'model', display_name: 'Claude Opus 5.5', created_at: '2024-01-01T00:00:00Z' },
            { id: 'claude-sonnet-5-5', type: 'model', display_name: 'Claude Sonnet 5.5', created_at: '2024-01-01T00:00:00Z' },
            { id: 'claude-haiku-5-5', type: 'model', display_name: 'Claude Haiku 5.5', created_at: '2024-01-01T00:00:00Z' },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(3);
      expect(models[0]).toMatchObject({
        id: 'claude-opus-5-5',
        provider: 'anthropic',
        name: 'Claude Opus 5.5',
        contextWindow: 1_000_000,
        capabilities: { vision: true, video: false, toolCalling: true, fileInput: true, streaming: true },
        pricing: { inputPerMillion: 4.0, outputPerMillion: 20.0 },
      });
    });

    it('filters out unsupported models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'claude-opus-5-5', type: 'model', display_name: 'Claude Opus 5.5', created_at: '2024-01-01T00:00:00Z' },
            { id: 'claude-3-opus', type: 'model', display_name: 'Claude 3 Opus', created_at: '2023-01-01T00:00:00Z' },
            { id: 'claude-sonnet-5-5', type: 'model', display_name: 'Claude Sonnet 5.5', created_at: '2024-01-01T00:00:00Z' },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5']);
    });

    it('throws ProviderNetworkError on network failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

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
      expect(adapter.providerId).toBe('anthropic');
    });

    it('has correct supportedModels', () => {
      expect(adapter.supportedModels).toEqual([
        'claude-opus-5-5',
        'claude-sonnet-5-5',
        'claude-haiku-5-5',
      ]);
    });
  });
});