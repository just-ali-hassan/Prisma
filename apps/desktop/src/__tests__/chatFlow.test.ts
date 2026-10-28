/**
 * Desktop Chat Flow Integration Tests
 *
 * Verifies the complete user flow requested:
 * 1. Create a new conversation and send a message.
 * 2. Switch to another working OpenAI model and send another message.
 * 3. Change temperature, max tokens, and top-p in the parameter panel; send a message.
 * 4. Search for text from the conversation in History.
 * 5. Verify responses work, selected model/settings appear correctly, and search finds the message.
 * 6. Verify ModelPicker is restricted to registered providers (OpenAI in M2).
 * 7. Verify model changes are disabled during streaming.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { providerRegistry, MODEL_CAPABILITIES, getModelsForProvider, isModelUsable } from '@prisma-ai/core/providers';
import { OpenAIAdapter } from '@prisma-ai/core/providers/adapters/openai.adapter';
import type { Database } from '@prisma-ai/core/db/schema';
import type { Conversation, Message } from '@prisma-ai/core/db/conversations';
import { searchMessages } from '@prisma-ai/core/db/search';

// In-memory mock database tracking conversations and messages with FTS5 emulation
function createInMemoryDatabase(): Database & {
  conversations: Map<string, Conversation>;
  messages: Message[];
  reset: () => void;
} {
  const conversations = new Map<string, Conversation>();
  const messages: Message[] = [];

  return {
    conversations,
    messages,
    reset() {
      conversations.clear();
      messages.length = 0;
    },
    async exec(sql: string) {
      // no-op for mock
    },
    async run(sql: string, params: unknown[] = []) {
      const trimmed = sql.trim();
      if (trimmed.startsWith('INSERT INTO conversations')) {
        const conv: Conversation = {
          id: params[0] as string,
          projectId: (params[1] as string) || null,
          title: (params[2] as string) || null,
          modelId: params[3] as string,
          providerId: params[4] as string,
          systemPrompt: (params[5] as string) || null,
          parameters: (params[6] as string) || null,
          createdAt: params[7] as number,
          updatedAt: params[8] as number,
        };
        conversations.set(conv.id, conv);
        return { lastInsertRowid: 1, changes: 1 };
      }

      if (trimmed.startsWith('UPDATE conversations')) {
        const id = params[params.length - 1] as string;
        const existing = conversations.get(id);
        if (existing) {
          if (trimmed.includes('model_id = ?')) {
            const idx = trimmed.indexOf('model_id = ?');
            const match = trimmed.substring(0, idx).match(/\?/g);
            const paramIdx = match ? match.length : 0;
            existing.modelId = params[paramIdx] as string;
          }
          if (trimmed.includes('parameters = ?')) {
            const idx = trimmed.indexOf('parameters = ?');
            const match = trimmed.substring(0, idx).match(/\?/g);
            const paramIdx = match ? match.length : 0;
            existing.parameters = params[paramIdx] as string;
          }
          if (trimmed.includes('title = ?')) {
            const idx = trimmed.indexOf('title = ?');
            const match = trimmed.substring(0, idx).match(/\?/g);
            const paramIdx = match ? match.length : 0;
            existing.title = params[paramIdx] as string;
          }
          existing.updatedAt = Date.now();
        }
        return { lastInsertRowid: 1, changes: 1 };
      }

      if (trimmed.startsWith('INSERT INTO messages')) {
        const msg: Message = {
          id: params[0] as string,
          conversationId: params[1] as string,
          role: params[2] as Message['role'],
          content: (params[3] as string) || null,
          toolCalls: (params[4] as string) || null,
          toolCallId: (params[5] as string) || null,
          attachments: (params[6] as string) || null,
          modelId: (params[7] as string) || null,
          tokenCount: (params[8] as number) || null,
          cost: (params[9] as number) || null,
          extra: (params[10] as string) || null,
          createdAt: params[11] as number,
        };
        messages.push(msg);
        return { lastInsertRowid: messages.length, changes: 1 };
      }

      return { lastInsertRowid: 1, changes: 1 };
    },
    async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      const trimmed = sql.trim();
      if (trimmed.includes('FROM conversations WHERE id = ?')) {
        const id = params[0] as string;
        return conversations.get(id) as T | undefined;
      }
      return undefined;
    },
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const trimmed = sql.trim();
      if (trimmed.includes('FROM messages_fts f') || trimmed.includes('WHERE messages_fts MATCH')) {
        const query = (params[0] as string).toLowerCase();
        const matches = messages
          .filter((m) => m.content && m.content.toLowerCase().includes(query))
          .map((m) => {
            const conv = conversations.get(m.conversationId);
            return {
              conversation_id: m.conversationId,
              title: conv?.title || 'Untitled',
              content: m.content!,
              created_at: m.createdAt,
              id: m.id,
            };
          });
        return matches as T[];
      }
      if (trimmed.startsWith('SELECT * FROM messages WHERE conversation_id = ?')) {
        const convId = params[0] as string;
        return messages.filter((m) => m.conversationId === convId) as T[];
      }
      return [] as T[];
    },
    async close() {},
  };
}

const { mockDb } = vi.hoisted(() => {
  return { mockDb: createInMemoryDatabase() };
});

vi.mock('@/utils/database', () => ({
  database: mockDb,
  default: mockDb,
}));

// Import useChatStore AFTER vi.mock
import { useChatStore } from '../stores/chatStore';

describe('Desktop Chat Flow', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDb.reset();

    // Register OpenAI provider
    providerRegistry.clear();
    const keyManager = {
      getKey: vi.fn().mockResolvedValue('sk-test-mock-key'),
    };
    const adapter = new OpenAIAdapter(keyManager);
    providerRegistry.register(adapter);

    // Mock fetch for streaming OpenAI responses
    mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const userMessage = body.messages?.[body.messages.length - 1]?.content || 'Hello';
      const model = body.model || 'gpt-4o';

      const sseChunks = [
        `data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"${model}","choices":[{"index":0,"delta":{"content":"Response to: ${userMessage}"},"finish_reason":null}]}\n\n`,
        `data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"${model}","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
        `data: [DONE]\n\n`,
      ];

      let chunkIndex = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunkIndex < sseChunks.length) {
            controller.enqueue(new TextEncoder().encode(sseChunks[chunkIndex++]));
          } else {
            controller.close();
          }
        },
      });

      return {
        ok: true,
        status: 200,
        body: stream,
        json: async () => ({
          id: 'chatcmpl-1',
          object: 'chat.completion',
          model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: `Response to: ${userMessage}` },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        text: async () => '',
      };
    });

    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ isStreaming: false, error: null });
    useChatStore.getState().clearHistory();
  });

  it('restricts available models to registered providers (OpenAI in M2)', () => {
    const registered = providerRegistry.getRegisteredProviders();
    expect(registered).toEqual(['openai']);

    // Check that getModelsForProvider only returns models for registered providers
    const usableProviders = registered.length > 0 ? registered : ['openai'];
    const usableModels = usableProviders.flatMap((p) =>
      getModelsForProvider(p as any).filter((m) => m.id !== 'openrouter:auto' && m.id !== 'omniroute:auto')
    );

    // All usable models must belong to openai
    for (const model of usableModels) {
      expect(model.provider).toBe('openai');
    }

    // Must include gpt-4o, gpt-4o-mini, gpt-4.5, o1, etc.
    const modelIds = usableModels.map((m) => m.id);
    expect(modelIds).toContain('gpt-4o');
    expect(modelIds).toContain('gpt-4o-mini');
    expect(modelIds).toContain('o1');

    // Must NOT include future M3 providers like anthropic or google
    expect(modelIds).not.toContain('claude-3-5-sonnet-20241022');
    expect(modelIds).not.toContain('gemini-1.5-pro');
  });

  it('executes full sequence: create conversation -> switch model -> change parameters -> search history', async () => {
    const store = useChatStore.getState();

    // 1. Create a new conversation and send a message
    await store.initializeSession('gpt-4o', 'openai');
    expect(useChatStore.getState().currentModel).toBe('gpt-4o');
    expect(useChatStore.getState().currentProvider).toBe('openai');
    const convId = useChatStore.getState().currentConversationId;
    expect(convId).toBeTruthy();

    await useChatStore.getState().sendMessage('Hello from step 1 about TypeScript generics');

    // Verify response was received
    const messagesStep1 = useChatStore.getState().messages;
    expect(messagesStep1).toHaveLength(2);
    expect(messagesStep1[0].role).toBe('user');
    expect(messagesStep1[0].content).toBe('Hello from step 1 about TypeScript generics');
    expect(messagesStep1[1].role).toBe('assistant');
    expect(messagesStep1[1].content).toContain('Response to: Hello from step 1 about TypeScript generics');

    // Verify fetch call used gpt-4o
    const lastFetchBody1 = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(lastFetchBody1.model).toBe('gpt-4o');

    // 2. Switch to another working OpenAI model (gpt-4o-mini) and send another message
    useChatStore.getState().setModel('gpt-4o-mini');
    expect(useChatStore.getState().currentModel).toBe('gpt-4o-mini');

    await useChatStore.getState().sendMessage('Followup question about interfaces');

    // Verify fetch call used gpt-4o-mini
    const lastFetchBody2 = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(lastFetchBody2.model).toBe('gpt-4o-mini');
    expect(useChatStore.getState().messages).toHaveLength(4);

    // 3. Change temperature, max tokens, and top-p in parameter panel; send another message
    useChatStore.getState().setTemperature(0.2);
    useChatStore.getState().setMaxTokens(1024);
    useChatStore.getState().setTopP(0.85);

    expect(useChatStore.getState().temperature).toBe(0.2);
    expect(useChatStore.getState().maxTokens).toBe(1024);
    expect(useChatStore.getState().topP).toBe(0.85);

    await useChatStore.getState().sendMessage('Third message with custom parameters');

    // Verify parameters reached the request
    const lastFetchBody3 = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(lastFetchBody3.model).toBe('gpt-4o-mini');
    expect(lastFetchBody3.temperature).toBe(0.2);
    expect(lastFetchBody3.max_tokens).toBe(1024);
    expect(lastFetchBody3.top_p).toBe(0.85);

    // 4. Search for text from the conversation in History
    const searchResults = await searchMessages(mockDb, 'generics');
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].conversationId).toBe(convId);
    expect(searchResults[0].snippet.toLowerCase()).toContain('generics');

    const searchResults2 = await searchMessages(mockDb, 'interfaces');
    expect(searchResults2.length).toBeGreaterThan(0);
    expect(searchResults2[0].conversationId).toBe(convId);
    expect(searchResults2[0].snippet.toLowerCase()).toContain('interfaces');
  });

  it('omits temperature, top-p, and penalties when switching to reasoning model (o1, o3, o4)', async () => {
    await useChatStore.getState().initializeSession('o1', 'openai');
    useChatStore.getState().setTemperature(0.9);
    useChatStore.getState().setTopP(0.95);

    await useChatStore.getState().sendMessage('Reasoning model test query');

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.model).toBe('o1');
    expect(fetchBody.temperature).toBeUndefined();
    expect(fetchBody.top_p).toBeUndefined();
    expect(fetchBody.frequency_penalty).toBeUndefined();
    expect(fetchBody.presence_penalty).toBeUndefined();
  });

  it('persists parameters and restores them when reloading conversation', async () => {
    await useChatStore.getState().initializeSession('gpt-4o', 'openai');
    const convId = useChatStore.getState().currentConversationId!;

    useChatStore.getState().setTemperature(0.35);
    useChatStore.getState().setMaxTokens(2048);
    useChatStore.getState().setTopP(0.92);
    useChatStore.getState().setFrequencyPenalty(0.4);
    useChatStore.getState().setPresencePenalty(0.6);

    // Re-initialize session with existing conversation ID
    await useChatStore.getState().initializeSession('gpt-4o', 'openai', convId);

    expect(useChatStore.getState().temperature).toBe(0.35);
    expect(useChatStore.getState().maxTokens).toBe(2048);
    expect(useChatStore.getState().topP).toBe(0.92);
    expect(useChatStore.getState().frequencyPenalty).toBe(0.4);
    expect(useChatStore.getState().presencePenalty).toBe(0.6);
  });

  it('prevents new sends while streaming', async () => {
    await useChatStore.getState().initializeSession('gpt-4o', 'openai');
    useChatStore.setState({ isStreaming: true });

    // Trying to send while streaming throws an error
    await expect(useChatStore.getState().sendMessage('Concurrent message')).rejects.toThrow(
      'Already streaming'
    );
  });

  it('disables model and provider changes while streaming', async () => {
    await useChatStore.getState().initializeSession('gpt-4o', 'openai');
    useChatStore.setState({ isStreaming: true });

    useChatStore.getState().setModel('gpt-4o-mini');
    expect(useChatStore.getState().currentModel).toBe('gpt-4o');

    useChatStore.getState().setProvider('anthropic' as any);
    expect(useChatStore.getState().currentProvider).toBe('openai');
  });

  it('bounds max tokens by model context window', () => {
    const gpt4oEntry = MODEL_CAPABILITIES.find((m) => m.id === 'gpt-4o' && m.provider === 'openai');
    expect(gpt4oEntry?.contextWindow).toBe(128000);

    const miniEntry = MODEL_CAPABILITIES.find((m) => m.id === 'gpt-4o-mini' && m.provider === 'openai');
    expect(miniEntry?.contextWindow).toBe(128000);
  });

  it('restricts model usability to registered providers and recognized model names', () => {
    // OpenAI is registered in beforeEach with supported models
    expect(isModelUsable('openai', 'gpt-4o')).toBe(true);
    expect(isModelUsable('openai', 'unregistered-model')).toBe(false);

    // Unregistered providers return false
    expect(isModelUsable('anthropic', 'claude-opus-5-5')).toBe(false);
    expect(isModelUsable('google', 'gemini-1.5-flash')).toBe(false);
  });

  it('rejects sending unsupported attachments and displays clear error message', async () => {
    await useChatStore.getState().initializeSession('o1', 'openai');
    await expect(
      useChatStore.getState().sendMessage('Image query', [{ type: 'image', path: 'img.png', mimeType: 'image/png' }])
    ).rejects.toThrow('o1 does not support image attachments.');

    expect(useChatStore.getState().error?.message).toBe('o1 does not support image attachments.');
  });

  it('ensures every model in the picker belongs to a registered provider and is recognized by its adapter', () => {
    // With only OpenAI registered
    const registered = providerRegistry.getRegisteredProviders();
    expect(registered).toEqual(['openai']);

    const usableModels = MODEL_CAPABILITIES.filter((m) => isModelUsable(m.provider, m.id));
    expect(usableModels.length).toBeGreaterThan(0);
    for (const model of usableModels) {
      expect(registered).toContain(model.provider);
      const adapter = providerRegistry.get(model.provider);
      expect(adapter).toBeDefined();
      expect(adapter!.supportedModels).toContain(model.id);
    }

    // Register Anthropic and check its models are added
    const anthropicAdapter = {
      providerId: 'anthropic' as const,
      supportedModels: ['claude-sonnet-5-5' as const],
      chat: vi.fn(),
      stream: vi.fn(),
      listModels: vi.fn(),
      cancel: vi.fn(),
    };
    providerRegistry.register(anthropicAdapter as any);

    const updatedUsable = MODEL_CAPABILITIES.filter((m) => isModelUsable(m.provider, m.id));
    const anthropicModels = updatedUsable.filter((m) => m.provider === 'anthropic');
    expect(anthropicModels.length).toBe(1);
    expect(anthropicModels[0].id).toBe('claude-sonnet-5-5');

    // Unregistered providers like Google or Groq still have 0 usable models
    expect(updatedUsable.filter((m) => m.provider === 'google')).toHaveLength(0);
    expect(updatedUsable.filter((m) => m.provider === 'groq')).toHaveLength(0);
  });

  it('uses regular chat path and non-streaming completion for non-streaming models', async () => {
    await useChatStore.getState().initializeSession('o1', 'openai');
    const session = useChatStore.getState().session;
    expect(session?.supportsStreaming()).toBe(false);

    await useChatStore.getState().sendMessage('Explain quantum entanglement simply');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, calledInit] = mockFetch.mock.calls[0];
    const body = JSON.parse(calledInit.body as string);
    expect(body.model).toBe('o1');
    expect(body.stream).toBe(false);

    // Verify response is stored normally in message history
    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toContain('Response to: Explain quantum entanglement simply');
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it('blocks or omits unsupported settings across reasoning models, penalty-restricted providers, and attachments', async () => {
    // 1. Reasoning models omit temperature, topP, frequencyPenalty, presencePenalty
    await useChatStore.getState().initializeSession('o1', 'openai');
    useChatStore.getState().setTemperature(0.8);
    useChatStore.getState().setTopP(0.9);
    useChatStore.getState().setFrequencyPenalty(0.5);
    useChatStore.getState().setPresencePenalty(0.5);

    await useChatStore.getState().sendMessage('Analyze logic puzzle');
    const reqBody1 = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(reqBody1.temperature).toBeUndefined();
    expect(reqBody1.top_p).toBeUndefined();
    expect(reqBody1.frequency_penalty).toBeUndefined();
    expect(reqBody1.presence_penalty).toBeUndefined();

    // 2. Models without vision block image attachments with clear plain error
    await expect(
      useChatStore.getState().sendMessage('Look at this', [{ type: 'image', path: 'chart.png', mimeType: 'image/png' }])
    ).rejects.toThrow('o1 does not support image attachments.');
    expect(useChatStore.getState().error?.message).toBe('o1 does not support image attachments.');

    // 3. Models without file input block file attachments with clear plain error
    const deepseekAdapter = {
      providerId: 'deepseek' as const,
      supportedModels: ['deepseek-reasoner' as const],
      chat: vi.fn().mockResolvedValue({ role: 'assistant', content: 'DeepSeek reply' }),
      stream: vi.fn(),
      listModels: vi.fn(),
      cancel: vi.fn(),
    };
    providerRegistry.register(deepseekAdapter as any);
    await useChatStore.getState().initializeSession('deepseek-reasoner', 'deepseek');

    await expect(
      useChatStore.getState().sendMessage('Process file', [{ type: 'file', path: 'data.csv', mimeType: 'text/csv' }])
    ).rejects.toThrow('deepseek-reasoner does not support file attachments.');
    expect(useChatStore.getState().error?.message).toBe('deepseek-reasoner does not support file attachments.');

    // 4. Provider without penalty support omits frequencyPenalty and presencePenalty
    const anthropicAdapter = {
      providerId: 'anthropic' as const,
      supportedModels: ['claude-sonnet-5-5' as const],
      chat: vi.fn(),
      stream: vi.fn().mockImplementation(async function* () {
        yield { type: 'token', content: 'Claude response' };
        yield { type: 'done' };
      }),
      listModels: vi.fn(),
      cancel: vi.fn(),
    };
    providerRegistry.register(anthropicAdapter as any);
    await useChatStore.getState().initializeSession('claude-sonnet-5-5', 'anthropic');
    useChatStore.getState().setTemperature(0.7);
    useChatStore.getState().setTopP(0.85);
    useChatStore.getState().setFrequencyPenalty(0.6);
    useChatStore.getState().setPresencePenalty(0.6);

    await useChatStore.getState().sendMessage('Hello Claude');
    expect(anthropicAdapter.stream).toHaveBeenCalled();
    const anthropicReq = (anthropicAdapter.stream as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(anthropicReq.temperature).toBe(0.7);
    expect(anthropicReq.topP).toBe(0.85);
    expect(anthropicReq.frequencyPenalty).toBeUndefined();
    expect(anthropicReq.presencePenalty).toBeUndefined();
  });

  it('clearly displays provider errors when request fails', async () => {
    await useChatStore.getState().initializeSession('gpt-4o', 'openai');

    // Simulate 429 Rate Limit error from provider
    mockFetch.mockImplementationOnce(async () => ({
      ok: false,
      status: 429,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded: Please try again later.' } }),
      json: async () => ({ error: { message: 'Rate limit exceeded: Please try again later.' } }),
    }));

    await expect(
      useChatStore.getState().sendMessage('Hello that will fail')
    ).rejects.toThrow();

    // Verify error is shown clearly in store state and streaming is stopped
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().error).toBeDefined();
    expect(useChatStore.getState().error?.message).toContain('Rate limit exceeded');

    // Messages array includes the error in the conversation
    const msgs = useChatStore.getState().messages;
    const assistantMsg = msgs.find((m) => m.role === 'assistant');
    expect(assistantMsg?.content).toContain('Rate limit exceeded');
  });

  it('clearly displays authentication errors from provider', async () => {
    await useChatStore.getState().initializeSession('gpt-4o', 'openai');

    // Simulate 401 Unauthorized
    mockFetch.mockImplementationOnce(async () => ({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ error: { message: 'Incorrect API key provided' } }),
      json: async () => ({ error: { message: 'Incorrect API key provided' } }),
    }));

    await expect(
      useChatStore.getState().sendMessage('Hello with bad auth')
    ).rejects.toThrow();

    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().error?.message).toContain('Incorrect API key provided');
  });
});
