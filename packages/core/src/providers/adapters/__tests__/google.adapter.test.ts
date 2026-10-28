/**
 * Google Adapter Tests
 *
 * Tests for the Google adapter with mocked API responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleAdapter } from '../google.adapter';
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
  getKey: vi.fn().mockResolvedValue('mock-google-api-key'),
};

describe('GoogleAdapter', () => {
  let adapter: GoogleAdapter;
  let abortController: AbortController;
  const mockMessages: NormalizedMessage[] = [
    { role: 'user', content: 'Hello' },
  ];
  const mockRequest: ChatRequest = {
    messages: mockMessages,
    model: 'gemini-1.5-flash',
    provider: 'google',
    stream: true,
  };

  beforeEach(() => {
    abortController = new AbortController();
    vi.clearAllMocks();
    adapter = new GoogleAdapter(mockKeyManager);
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
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":null,"index":0}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":" world"}]},"finishReason":null,"index":0}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"!"}]},"finishReason":"STOP","index":0}]}\n\n',
        'data: {"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(chunks),
      });

      const events: StreamEvent[] = [];
      await adapter.stream(mockRequest, (e) => events.push(e), abortController.signal);

      expect(events).toHaveLength(4);
      expect(events[0]).toEqual({ type: 'token', content: 'Hello' });
      expect(events[1]).toEqual({ type: 'token', content: ' world' });
      expect(events[2]).toEqual({ type: 'token', content: '!' });
      expect(events[3]).toEqual({
        type: 'done',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
    });

    it('handles tool calls in stream', async () => {
      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"get_weather","args":{"location":"NYC"}}}]},"finishReason":null,"index":0}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP","index":0}]}\n\n',
        'data: {"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}\n\n',
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
      expect(events[0].toolCalls![0]).toMatchObject({
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
      });
      expect(events[1]).toEqual({ type: 'done', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
    });

    it('throws ProviderAuthError on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'API key not valid', code: 401, status: 'UNAUTHENTICATED' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderAuthError);
    });

    it('throws ProviderAuthError on 400 with auth message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'API key not valid', code: 400, status: 'UNAUTHENTICATED' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderAuthError);
    });

    it('throws ProviderRateLimitError on 429 with retry-after', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => '60' },
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Rate limit exceeded', code: 429, status: 'RESOURCE_EXHAUSTED' } })),
      });

      await expect(adapter.stream(mockRequest, vi.fn(), abortController.signal)).rejects.toThrow(ProviderRateLimitError);
    });

    it('throws ProviderServerError on 500', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Internal server error', code: 500, status: 'INTERNAL' } })),
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
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":null,"index":0}]}\n\n',
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

    it('emits done event if stream ends without finishReason', async () => {
      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]},"finishReason":null,"index":0}]}\n\n',
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
        body: createMockStream(['data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP","index":0}]}\n\n']),
      });

      await adapter.stream(
        { ...mockRequest, systemPrompt: 'Answer briefly.' },
        vi.fn(),
        abortController.signal,
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        systemInstruction?: { parts: { text: string }[] };
      };
      expect(body.systemInstruction).toEqual({ parts: [{ text: 'Answer briefly.' }] });
    });

    it('handles image attachments in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP","index":0}]}\n\n']),
      });

      const complexRequest = {
        model: 'gemini-1.5-flash' as const,
        provider: 'google' as const,
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
        contents: { role: string; parts: (string | { inlineData: { mimeType: string; data: string } })[] }[];
      };
      const userContent = body.contents.find(c => c.role === 'user');
      expect(userContent).toBeDefined();
      const imageParts = (userContent!.parts as Array<{ inlineData?: { mimeType: string } }>).filter((p) => p.inlineData);
      expect(imageParts).toHaveLength(2);
    });

    it('includes tools with description in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP","index":0}]}\n\n']),
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
        tools: { functionDeclarations: { name: string; description: string; parameters: unknown }[] }[];
      };
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].functionDeclarations[0]).toMatchObject({
        name: 'get_weather',
        description: 'Get weather for a location',
        parameters: { type: 'object', properties: { location: { type: 'string' } } },
      });
    });

    it('handles toolChoice: none', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP","index":0}]}\n\n']),
      });

      const noneRequest = {
        ...mockRequest,
        toolChoice: 'none' as const,
      };

      await adapter.stream(noneRequest, vi.fn(), abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        toolConfig?: { functionCallingConfig: { mode: string } };
      };
      expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: 'NONE' } });
    });

    it('handles toolChoice: function', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP","index":0}]}\n\n']),
      });

      const functionRequest = {
        ...mockRequest,
        toolChoice: { type: 'function' as const, function: { name: 'get_weather' } },
      };

      await adapter.stream(functionRequest, vi.fn(), abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        toolConfig?: { functionCallingConfig: { mode: string; allowedFunctionNames: string[] } };
      };
      expect(body.toolConfig).toEqual({
        functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['get_weather'] },
      });
    });

    it('handles topK and other generation config', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP","index":0}]}\n\n']),
      });

      const configRequest = {
        ...mockRequest,
        extra: { top_k: 40 },
        maxTokens: 1000,
      };

      await adapter.stream(configRequest, vi.fn(), abortController.signal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        generationConfig?: { maxOutputTokens?: number; topK?: number };
      };
      expect(body.generationConfig).toMatchObject({
        maxOutputTokens: 1000,
        topK: 40,
      });
    });
  });

  describe('chat (non-streaming)', () => {
    const mockMessages: NormalizedMessage[] = [
      { role: 'user', content: 'Hello' },
    ];

    const mockRequest: ChatRequest = {
      messages: mockMessages,
      model: 'gemini-1.5-flash',
      provider: 'google',
      stream: false,
    };

    it('returns normalized message for successful response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: 'Hello world' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      });

      const result = await adapter.chat(mockRequest, abortController.signal);

      expect(result).toEqual({
        role: 'assistant',
        content: 'Hello world',
        toolCalls: undefined,
        toolCallId: undefined,
        extra: { usage: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } },
      });
    });

    it('handles tool calls in non-streaming response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              parts: [{ functionCall: { name: 'get_weather', args: { location: 'NYC' } } }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      });

      const result = await adapter.chat(mockRequest, abortController.signal);

      expect(result).toMatchObject({
        role: 'assistant',
        content: null,
        toolCalls: expect.arrayContaining([
          expect.objectContaining({
            type: 'function',
            function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
          }),
        ]),
        extra: { usage: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } },
      });
    });

    it('converts tool messages and image attachments in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: 'Got it' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      });

      const complexRequest = {
        model: 'gemini-1.5-flash' as const,
        provider: 'google' as const,
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
        contents: { role: string; parts: (string | { inlineData?: { mimeType: string; data: string }; functionCall?: { name: string; args: unknown }; functionResponse?: { name: string; response: unknown } })[] }[];
      };
      expect(body.contents[0].parts).toContainEqual(expect.objectContaining({ inlineData: { mimeType: 'image/png', data: 'img_base64' } }));
      expect(body.contents[0].parts).toContainEqual(expect.objectContaining({ inlineData: { mimeType: 'image/png', data: 'abc' } }));
      expect(body.contents[1].parts).toContainEqual(expect.objectContaining({
        functionCall: { name: 'get_weather', args: { location: 'NYC' } },
      }));
      expect(body.contents[2].parts).toContainEqual(expect.objectContaining({
        functionResponse: { name: 'call_123', response: { result: 'Sunny' } },
      }));
    });

    it('throws ProviderAuthError on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'API key not valid', code: 401, status: 'UNAUTHENTICATED' } })),
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
          models: [
            { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', inputTokenLimit: 1_000_000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] },
            { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', inputTokenLimit: 2_000_000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] },
            { name: 'gemini-1.0-pro', displayName: 'Gemini 1.0 Pro', inputTokenLimit: 30_000, outputTokenLimit: 2048, supportedGenerationMethods: ['generateContent'] },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(2);
      expect(models[0]).toMatchObject({
        id: 'gemini-1.5-flash',
        provider: 'google',
        name: 'Gemini 1.5 Flash',
        contextWindow: 1_008_192,
        capabilities: { vision: true, video: true, toolCalling: true, fileInput: true, streaming: true },
        pricing: { inputPerMillion: 0.075, outputPerMillion: 0.3 },
      });
    });

    it('filters out unsupported models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', inputTokenLimit: 1_000_000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-1.0-pro', displayName: 'Gemini 1.0 Pro', inputTokenLimit: 30_000, outputTokenLimit: 2048, supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', inputTokenLimit: 2_000_000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] },
          ],
        }),
      });

      const models = await adapter.listModels(abortController.signal);

      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(['gemini-1.5-flash', 'gemini-1.5-pro']);
    });

    it('throws ProviderNetworkError on network failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(adapter.listModels(abortController.signal)).rejects.toThrow(ProviderNetworkError);
    });

    it('throws ProviderNetworkError on server error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Server error', code: 500, status: 'INTERNAL' } })),
      });

      await expect(adapter.listModels(abortController.signal)).rejects.toThrow(ProviderNetworkError);
    });
  });

  describe('cancel', () => {
    it('aborts ongoing request', async () => {
      let abortHandler: (() => void) | null = null;

      mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
        await new Promise<void>((_, reject) => {
          abortHandler = () => {
            reject(new DOMException('Aborted', 'AbortError'));
          };
          init?.signal?.addEventListener('abort', abortHandler, { once: true });
        });
      });

      const sendPromise = adapter.stream(mockRequest, vi.fn(), abortController.signal);
      await new Promise((r) => setTimeout(r, 10));
      adapter.cancel();

      (abortHandler as (() => void) | null)?.();

      await expect(sendPromise).rejects.toThrow(ProviderCancelledError);
    });
  });

  describe('provider metadata', () => {
    it('has correct providerId', () => {
      expect(adapter.providerId).toBe('google');
    });

    it('has correct supportedModels', () => {
      expect(adapter.supportedModels).toEqual([
        'gemini-1.5-flash',
        'gemini-1.5-pro',
      ]);
    });
  });
});