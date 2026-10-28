/**
 * Chat Session Tests
 *
 * Tests for the ChatSession class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatSession, createChatSession } from '../chat-session';
import { providerRegistry } from '../../providers/registry';
import { OpenAIAdapter } from '../../providers/adapters/openai.adapter';
import type { NormalizedMessage, StreamEvent, ChatRequest, ToolCall, ModelId, ProviderId } from '../../providers/types';
import { ProviderCancelledError } from '../../providers/types';

describe('ChatSession', () => {
  let mockAdapter: OpenAIAdapter;
  let mockKeyManager: { getKey: ReturnType<typeof vi.fn> };
  let session: ChatSession;

  beforeEach(() => {
    vi.clearAllMocks();

    // Clear registry and register mock adapter
    providerRegistry.clear();
    mockKeyManager = { getKey: vi.fn().mockResolvedValue('sk-test-key') };
    mockAdapter = new OpenAIAdapter(mockKeyManager);
    providerRegistry.register(mockAdapter);

    session = createChatSession('gpt-4o', 'openai');
  });

  describe('getState', () => {
    it('returns initial state', () => {
      const state = session.getState();

      expect(state.messages).toEqual([]);
      expect(state.isStreaming).toBe(false);
      expect(state.currentModel).toBe('gpt-4o');
      expect(state.currentProvider).toBe('openai');
      expect(state.abortController).toBeNull();
    });
  });

  describe('getMessages', () => {
    it('returns empty array initially', () => {
      expect(session.getMessages()).toEqual([]);
    });
  });

  describe('isStreaming', () => {
    it('returns false initially', () => {
      expect(session.isStreaming()).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('throws if already streaming', async () => {
      // Mock a streaming response that never completes
      const mockStream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Never close - simulates ongoing stream
        },
      });

      vi.spyOn(mockAdapter, 'stream').mockImplementation((req, onEvent) => {
        onEvent({ type: 'token', content: 'test' });
        return Promise.resolve();
      });

      // Start streaming
      const promise = session.sendMessage('Hello');

      // Immediately try to send another
      await expect(session.sendMessage('World')).rejects.toThrow('Already streaming');
    });
  });

  describe('cancel', () => {
    it('cancels ongoing stream', async () => {
      let abortHandler: (() => void) | null = null;
      
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (req, onEvent, signal) => {
        // Simulate a long-running stream that checks for abort
        await new Promise<void>((resolve, reject) => {
          abortHandler = () => {
            onEvent({ type: 'error', error: new ProviderCancelledError('openai') });
            reject(new ProviderCancelledError('openai'));
          };
          signal.addEventListener('abort', abortHandler, { once: true });
        });
      });

      const sendPromise = session.sendMessage('Hello');
      // Give the stream time to start
      await new Promise(r => setTimeout(r, 10));
      session.cancel();

      if (abortHandler) abortHandler();
      
      await expect(sendPromise).rejects.toThrow(ProviderCancelledError);
    });
  });

  describe('retry', () => {
    it('removes last assistant message and re-streams', async () => {
      // Add messages using the internal state (for testing)
      (session as unknown as { state: { messages: NormalizedMessage[] } }).state.messages.push(
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      );

      vi.spyOn(mockAdapter, 'stream').mockImplementation((req, onEvent) => {
        onEvent({ type: 'token', content: 'New response' });
        onEvent({ type: 'done' });
        return Promise.resolve();
      });

      await session.retry();

      const messages = session.getMessages();
      // Should have system + user + new assistant (old assistant removed)
      expect(messages).toHaveLength(3);
      expect(messages[2].content).toBe('New response');
    });

    it('throws if streaming', async () => {
      vi.spyOn(mockAdapter, 'stream').mockImplementation(() => new Promise(() => {}));

      const promise = session.sendMessage('Hello');

      await expect(session.retry()).rejects.toThrow('Cannot retry while streaming');
    });
  });

  describe('setModel', () => {
    it('updates the current model', () => {
      session.setModel('gpt-4o-mini');
      expect(session.getState().currentModel).toBe('gpt-4o-mini');
    });
  });

  describe('setProvider', () => {
    it('updates the current provider', () => {
      // Register anthropic provider first
      const mockAnthropicAdapter: ProviderAdapter = { 
        providerId: 'anthropic' as ProviderId, 
        supportedModels: [],
        stream: vi.fn(),
        chat: vi.fn(),
        listModels: vi.fn(),
        cancel: vi.fn(),
      };
      providerRegistry.register(mockAnthropicAdapter);
      
      session.setProvider('anthropic');
      expect(session.getState().currentProvider).toBe('anthropic');
    });

    it('throws for unregistered provider', () => {
      expect(() => session.setProvider('unknown')).toThrow('Provider unknown not registered');
    });
  });

  describe('addSystemMessage', () => {
    it('adds system message at the beginning', () => {
      (session as unknown as { state: { messages: NormalizedMessage[] } }).state.messages.push({ role: 'user', content: 'Hello' });
      session.addSystemMessage('Be helpful');

      const messages = session.getMessages();
      expect(messages[0]).toEqual({ role: 'system', content: 'Be helpful' });
      expect(messages[1].role).toBe('user');
    });

    it('adds after existing system messages', () => {
      session.addSystemMessage('First');
      session.addSystemMessage('Second');
      (session as unknown as { state: { messages: NormalizedMessage[] } }).state.messages.push({ role: 'user', content: 'Hello' });

      const messages = session.getMessages();
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
    });
  });

  describe('clearHistory', () => {
    it('clears all messages except system by default', () => {
      session.addSystemMessage('System prompt');
      session.getMessages().push(
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      );

      session.clearHistory();

      const messages = session.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('system');
    });

    it('clears all messages including system when keepSystem is false', () => {
      session.addSystemMessage('System prompt');
      session.getMessages().push({ role: 'user', content: 'Hello' });

      session.clearHistory(false);

      expect(session.getMessages()).toHaveLength(0);
    });
  });

  describe('estimateTokens', () => {
    it('estimates tokens roughly', () => {
      (session as unknown as { state: { messages: NormalizedMessage[] } }).state.messages.push(
        { role: 'user', content: 'Hello world' }, // ~3 tokens
        { role: 'assistant', content: 'Hi there!' }, // ~3 tokens
      );

      const estimate = session.estimateTokens();
      expect(estimate).toBeGreaterThan(0);
    });
  });

  describe('tool calls', () => {
    it('handles tool calls during streaming', async () => {
      const toolCalls: ToolCall[] = [
        { id: 'call-1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"NYC"}' } },
      ];

      vi.spyOn(mockAdapter, 'stream').mockImplementation((req, onEvent) => {
        onEvent({ type: 'tool_call', toolCalls });
        onEvent({ type: 'done' });
        return Promise.resolve();
      });

      await session.sendMessage('What is the weather in NYC?');

      const messages = session.getMessages();
      const lastMsg = messages[messages.length - 1];
      expect(lastMsg.role).toBe('assistant');
      expect(lastMsg.toolCalls).toEqual(toolCalls);
    });

    it('calls onToolCall callback during streaming', async () => {
      const onToolCall = vi.fn();
      const toolCalls: ToolCall[] = [
        { id: 'call-1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"NYC"}' } },
      ];

      // Create a new session with onToolCall callback
      const sessionWithCallbacks = createChatSession('gpt-4o', 'openai', {
        onToolCall,
      });

      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (req, onEvent) => {
        onEvent({ type: 'tool_call', toolCalls: [{ id: 'call-1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"NYC"}' } }] });
        onEvent({ type: 'done' });
      });

      await sessionWithCallbacks.sendMessage('What is the weather?');
      expect(onToolCall).toHaveBeenCalledWith([
        { id: 'call-1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"NYC"}' } },
      ]);
    });
  });

  describe('stream error handling', () => {
    it('finalizes message on Error thrown during stream without abort', async () => {
      const onError = vi.fn();
      const s = createChatSession('gpt-4o', 'openai', { onError });

      vi.spyOn(mockAdapter, 'stream').mockRejectedValue(new Error('Stream crash'));

      await expect(s.sendMessage('Hello')).rejects.toThrow('Stream crash');
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Stream crash' }));
      expect(s.getState().isStreaming).toBe(false);
    });

    it('finalizes message on non-Error thrown during stream without abort', async () => {
      const onError = vi.fn();
      const s = createChatSession('gpt-4o', 'openai', { onError });

      vi.spyOn(mockAdapter, 'stream').mockRejectedValue('String stream failure');

      await expect(s.sendMessage('Hello')).rejects.toThrow();
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'String stream failure' }));
      expect(s.getState().isStreaming).toBe(false);
    });

    it('handles stream events with undefined optional fields', async () => {
      const onToken = vi.fn();
      const onToolCall = vi.fn();
      const onError = vi.fn();
      const s = createChatSession('gpt-4o', 'openai', { onToken, onToolCall, onError });

      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({ type: 'token' });
        onEvent({ type: 'tool_call' });
        onEvent({ type: 'error' });
        onEvent({ type: 'done' });
      });

      await s.sendMessage('Test undefined event fields');
      expect(onToken).toHaveBeenCalledWith('');
      expect(onToolCall).toHaveBeenCalledWith([]);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unknown error' }));
    });

    it('works when no callback options are provided', async () => {
      const s = createChatSession('gpt-4o', 'openai');
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({ type: 'token', content: 'hello' });
        onEvent({ type: 'done' });
      });
      await s.sendMessage('test no options');
      expect(s.getMessages()).toHaveLength(2);
    });

    it('notifies onMessage when addSystemMessage is called', () => {
      const onMessage = vi.fn();
      const s = createChatSession('gpt-4o', 'openai', { onMessage });
      s.addSystemMessage('New system');
      expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'system', content: 'New system' }));
    });

    it('estimates tokens with null content in history', () => {
      const s = new ChatSession(
        [
          { role: 'tool', content: null },
          { role: 'user', content: 'Hello world' },
        ],
        'gpt-4o',
        'openai'
      );
      expect(s.estimateTokens()).toBeGreaterThan(0);
    });

    it('triggers onTitleGenerate for long and short first prompts', async () => {
      const onTitleGenerate = vi.fn();
      const s1 = createChatSession('gpt-4o', 'openai', { onTitleGenerate });
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({ type: 'token', content: 'resp' });
        onEvent({ type: 'done' });
      });
      await s1.sendMessage('short');
      expect(onTitleGenerate).toHaveBeenCalledWith('short');

      const s2 = createChatSession('gpt-4o', 'openai', { onTitleGenerate });
      await s2.sendMessage('a'.repeat(60));
      expect(onTitleGenerate).toHaveBeenCalledWith('a'.repeat(50) + '...');
    });

    it('estimates cost as undefined for model without pricing', async () => {
      // Use a model not in the capability table
      const s = createChatSession('unknown-model', 'openai');
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({ type: 'token', content: 'hello' });
        onEvent({ type: 'done', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
      });
      await s.sendMessage('Hi');
      const msgs = s.getMessages();
      const assistantMsg = msgs.find((m) => m.role === 'assistant');
      expect(assistantMsg?.cost).toBeUndefined();
    });

    it('appends error to partial assistant content on stream error', async () => {
      const s = createChatSession('gpt-4o', 'openai');
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({ type: 'token', content: 'partial text' });
        const err = new Error('connection lost');
        onEvent({ type: 'error', error: err });
        throw err;
      });
      await expect(s.sendMessage('Hello')).rejects.toThrow('connection lost');
      const msgs = s.getMessages();
      const last = msgs[msgs.length - 1];
      expect(last.content).toContain('partial text\n\n[Error: connection lost]');
    });

    it('notifies onMessage and onDone during sendMessage', async () => {
      const onMessage = vi.fn();
      const onDone = vi.fn();
      const s = createChatSession('gpt-4o', 'openai', { onMessage, onDone });
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({ type: 'token', content: 'hello' });
        onEvent({ type: 'done', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });
      });
      await s.sendMessage('Hi');
      expect(onMessage).toHaveBeenCalledTimes(2);
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onMessage.mock.calls[1][0]).toMatchObject({
        role: 'assistant',
        modelId: 'gpt-4o',
        tokenCount: 2,
        cost: 0.0000125,
        extra: { usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
      });
    });
  });

  describe('non-streaming models support', () => {
    it('supportsStreaming returns false for o1 and true for gpt-4o', () => {
      const o1Session = createChatSession('o1', 'openai');
      const gpt4Session = createChatSession('gpt-4o', 'openai');
      const unknownSession = createChatSession('custom-model', 'openai');

      expect(o1Session.supportsStreaming()).toBe(false);
      expect(gpt4Session.supportsStreaming()).toBe(true);
      expect(unknownSession.supportsStreaming()).toBe(true);
    });

    it('uses adapter.chat for models marked as not supporting streaming', async () => {
      const o1Session = createChatSession('o1', 'openai');
      const streamSpy = vi.spyOn(mockAdapter, 'stream');
      const chatSpy = vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: 'Completed response from o1',
        extra: {
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        },
      });

      await o1Session.sendMessage('Reason about this');

      expect(streamSpy).not.toHaveBeenCalled();
      expect(chatSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'o1',
          stream: false,
        }),
        expect.any(AbortSignal)
      );

      const msgs = o1Session.getMessages();
      expect(msgs).toHaveLength(2);
      expect(msgs[1]).toMatchObject({
        role: 'assistant',
        content: 'Completed response from o1',
        modelId: 'o1',
        tokenCount: 30,
      });
      expect(o1Session.isStreaming()).toBe(false);
    });

    it('invokes callbacks onToken, onToolCall, onDone, and onTitleGenerate for non-streaming models', async () => {
      const onToken = vi.fn();
      const onToolCall = vi.fn();
      const onDone = vi.fn();
      const onTitleGenerate = vi.fn();

      const o1Session = createChatSession('o1', 'openai', {
        onToken,
        onToolCall,
        onDone,
        onTitleGenerate,
      });

      const toolCalls: ToolCall[] = [
        { id: 'call-1', type: 'function', function: { name: 'calculator', arguments: '{"exp":"2+2"}' } },
      ];

      vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: 'The answer is 4',
        toolCalls,
        extra: {
          usage: {
            promptTokens: 15,
            completionTokens: 10,
            totalTokens: 25,
          },
        },
      });

      await o1Session.sendMessage('Calculate 2+2 please');

      expect(onToken).toHaveBeenCalledWith('The answer is 4');
      expect(onToolCall).toHaveBeenCalledWith(toolCalls);
      expect(onDone).toHaveBeenCalledWith({
        promptTokens: 15,
        completionTokens: 10,
        totalTokens: 25,
      });
      expect(onTitleGenerate).toHaveBeenCalledWith('Calculate 2+2 please');
    });

    it('handles non-streaming model with tokenCount fallback when extra.usage is missing', async () => {
      const o1Session = createChatSession('o1', 'openai');
      vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: 'No extra usage',
        tokenCount: 42,
      });

      await o1Session.sendMessage('Hello');
      const msgs = o1Session.getMessages();
      expect(msgs[1].tokenCount).toBe(42);
    });

    it('handles non-streaming model with Anthropic usage format and empty rawUsage', async () => {
      const o1Session = createChatSession('o1', 'openai');
      vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: 'Anthropic style',
        extra: {
          usage: {
            input_tokens: 5,
            output_tokens: 15,
          },
        },
      });

      await o1Session.sendMessage('Hello Anthropic');
      expect(o1Session.getMessages()[1].tokenCount).toBe(20);

      // Empty rawUsage fallback
      vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: 'Empty rawUsage',
        extra: { usage: {} },
      });
      await o1Session.sendMessage('Hello empty');
      expect(o1Session.getMessages()[3].tokenCount).toBe(0);
    });

    it('handles non-streaming model with Google usage format', async () => {
      const o1Session = createChatSession('o1', 'openai');
      vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: 'Google style',
        extra: {
          usage: {
            promptTokenCount: 8,
            candidatesTokenCount: 12,
            totalTokenCount: 20,
          },
        },
      });

      await o1Session.sendMessage('Hello Google');
      expect(o1Session.getMessages()[1].tokenCount).toBe(20);
    });

    it('preserves extra when no usage is present', async () => {
      const o1Session = createChatSession('o1', 'openai');
      vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: 'Custom extra',
        extra: {
          customMetadata: 'test-meta',
        },
      });

      await o1Session.sendMessage('Hello metadata');
      const msgs = o1Session.getMessages();
      expect(msgs[1].extra).toEqual({ customMetadata: 'test-meta' });
      expect(msgs[1].tokenCount).toBeUndefined();
    });

    it('handles non-streaming model when response has no content or toolCalls or usage', async () => {
      const onToken = vi.fn();
      const onToolCall = vi.fn();
      const o1Session = createChatSession('o1', 'openai', { onToken, onToolCall });
      vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: null,
      });

      await o1Session.sendMessage('Empty response');
      expect(onToken).not.toHaveBeenCalled();
      expect(onToolCall).not.toHaveBeenCalled();
      const msgs = o1Session.getMessages();
      expect(msgs[1].content).toBeNull();
      expect(msgs[1].tokenCount).toBeUndefined();
    });

    it('handles non-streaming model error with Error instance', async () => {
      const onError = vi.fn();
      const o1Session = createChatSession('o1', 'openai', { onError });
      vi.spyOn(mockAdapter, 'chat').mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(o1Session.sendMessage('Hello')).rejects.toThrow('Rate limit exceeded');
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Rate limit exceeded' }));
      const msgs = o1Session.getMessages();
      expect(msgs[1].content).toBe('Error: Rate limit exceeded');
      expect(o1Session.isStreaming()).toBe(false);
    });

    it('handles non-streaming model error with string error', async () => {
      const onError = vi.fn();
      const o1Session = createChatSession('o1', 'openai', { onError });
      vi.spyOn(mockAdapter, 'chat').mockRejectedValue('Fatal network drop');

      await expect(o1Session.sendMessage('Hello')).rejects.toThrow('Fatal network drop');
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Fatal network drop' }));
      const msgs = o1Session.getMessages();
      expect(msgs[1].content).toBe('Error: Fatal network drop');
    });

    it('handles abort cancellation during non-streaming chat', async () => {
      const o1Session = createChatSession('o1', 'openai');
      vi.spyOn(mockAdapter, 'chat').mockImplementation(async (_req, signal) => {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new ProviderCancelledError('openai'));
          });
        });
      });

      const sendPromise = o1Session.sendMessage('Slow query');
      await new Promise((r) => setTimeout(r, 10));
      o1Session.cancel();

      await expect(sendPromise).rejects.toThrow(ProviderCancelledError);
      const msgs = o1Session.getMessages();
      expect(msgs[1].content).toBeNull();
      expect(o1Session.isStreaming()).toBe(false);
    });

    it('retries successfully using adapter.chat for non-streaming models', async () => {
      const o1Session = createChatSession('o1', 'openai');
      let calls = 0;
      vi.spyOn(mockAdapter, 'chat').mockImplementation(async () => {
        calls++;
        return {
          role: 'assistant',
          content: `Reply #${calls}`,
        };
      });

      await o1Session.sendMessage('First prompt');
      expect(o1Session.getMessages()[1].content).toBe('Reply #1');

      await o1Session.retry();
      expect(calls).toBe(2);
      expect(o1Session.getMessages()).toHaveLength(2);
      expect(o1Session.getMessages()[1].content).toBe('Reply #2');
    });

    it('forces stream: false if model does not support streaming even when stream: true option passed', async () => {
      const o1Session = createChatSession('o1', 'openai');
      const chatSpy = vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: 'Ok',
      });

      await o1Session.sendMessage('Test', undefined, { stream: true });
      expect(chatSpy).toHaveBeenCalledWith(
        expect.objectContaining({ stream: false }),
        expect.any(AbortSignal)
      );
    });

    it('throws when sending image attachment with non-vision model', async () => {
      const o1Session = createChatSession('o1', 'openai');
      await expect(
        o1Session.sendMessage('Look at this', [{ type: 'image', path: 'test.png', mimeType: 'image/png' }])
      ).rejects.toThrow('o1 does not support image attachments.');

      await expect(
        o1Session.sendMessage('Look at this too', [{ type: 'file', path: 'photo.jpg', mimeType: 'image/jpeg' }])
      ).rejects.toThrow('o1 does not support image attachments.');
    });

    it('throws when sending file attachment with model lacking fileInput capability', async () => {
      const deepseekMock = {
        providerId: 'deepseek' as ProviderId,
        supportedModels: ['deepseek-reasoner'],
        chat: vi.fn().mockResolvedValue({ role: 'assistant', content: 'Ok' }),
        stream: vi.fn(),
      };
      providerRegistry.register(deepseekMock as any);

      const dsSession = createChatSession('deepseek-reasoner', 'deepseek');
      await expect(
        dsSession.sendMessage('Read this doc', [{ type: 'file', path: 'doc.pdf', mimeType: 'application/pdf' }])
      ).rejects.toThrow('deepseek-reasoner does not support file attachments.');
    });

    it('strips unsupported options for reasoning models and providers without penalty support', async () => {
      const o1Session = createChatSession('o1', 'openai');
      const chatSpy = vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: 'Reasoned reply',
      });

      await o1Session.sendMessage('Solve this', undefined, {
        temperature: 0.7,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
      });

      expect(chatSpy).toHaveBeenCalled();
      const calledReq = chatSpy.mock.calls[0][0];
      expect(calledReq.temperature).toBeUndefined();
      expect(calledReq.topP).toBeUndefined();
      expect(calledReq.frequencyPenalty).toBeUndefined();
      expect(calledReq.presencePenalty).toBeUndefined();

      // Test Anthropic strips frequencyPenalty and presencePenalty
      const anthropicMock = {
        providerId: 'anthropic' as ProviderId,
        supportedModels: ['claude-3-5-sonnet'],
        chat: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          yield { type: 'token', content: 'Claude reply' };
          yield { type: 'done' };
        }),
      };
      providerRegistry.register(anthropicMock as any);

      const anthropicSession = createChatSession('claude-3-5-sonnet', 'anthropic');
      await anthropicSession.sendMessage('Hello Claude', undefined, {
        temperature: 0.7,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
      });

      const anthropicReq = (anthropicMock.stream as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(anthropicReq.temperature).toBe(0.7);
      expect(anthropicReq.topP).toBe(0.9);
      expect(anthropicReq.frequencyPenalty).toBeUndefined();
      expect(anthropicReq.presencePenalty).toBeUndefined();

      // Test Google strips frequencyPenalty and presencePenalty
      const googleMock = {
        providerId: 'google' as ProviderId,
        supportedModels: ['gemini-1.5-flash'],
        chat: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          yield { type: 'token', content: 'Gemini reply' };
          yield { type: 'done' };
        }),
      };
      providerRegistry.register(googleMock as any);

      const googleSession = createChatSession('gemini-1.5-flash', 'google');
      await googleSession.sendMessage('Hello Gemini', undefined, {
        temperature: 0.7,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
      });

      const googleReq = (googleMock.stream as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(googleReq.temperature).toBe(0.7);
      expect(googleReq.topP).toBe(0.9);
      expect(googleReq.frequencyPenalty).toBeUndefined();
      expect(googleReq.presencePenalty).toBeUndefined();
    });

    it('shows provider errors clearly in assistant message and notifies onError', async () => {
      const onError = vi.fn();
      const s = createChatSession('gpt-4o', 'openai', { onError });
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        const err = new Error('401 Invalid API key provided');
        onEvent({ type: 'error', error: err });
        throw err;
      });

      await expect(s.sendMessage('Test auth fail')).rejects.toThrow('401 Invalid API key provided');
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: '401 Invalid API key provided' }));
      const msgs = s.getMessages();
      expect(msgs[1].role).toBe('assistant');
      expect(msgs[1].content).toBe('Error: 401 Invalid API key provided');
      expect(s.isStreaming()).toBe(false);
    });

    it('strips tools and toolChoice if model does not support tool calling', async () => {
      const noToolsMock = {
        providerId: 'groq' as ProviderId,
        supportedModels: ['llama-3.1-8b'],
        chat: vi.fn(),
        stream: vi.fn().mockImplementation(async function* () {
          yield { type: 'token', content: 'Groq reply' };
          yield { type: 'done' };
        }),
      };
      providerRegistry.register(noToolsMock as any);

      const groqSession = createChatSession('llama-3.1-8b', 'groq');
      // Temporarily simulate toolCalling: false on a model
      const { MODEL_CAPABILITIES } = await import('../../providers/capability-table');
      const groqModel = MODEL_CAPABILITIES.find((m) => m.id === 'llama-3.1-8b' && m.provider === 'groq');
      const originalToolCalling = groqModel?.capabilities.toolCalling;
      if (groqModel) groqModel.capabilities.toolCalling = false;

      try {
        await groqSession.sendMessage('Call tool', undefined, {
          tools: [{ type: 'function', function: { name: 'test', description: 'test', parameters: {} } }],
          toolChoice: 'auto',
        });
        const groqReq = (noToolsMock.stream as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(groqReq.tools).toBeUndefined();
        expect(groqReq.toolChoice).toBeUndefined();
      } finally {
        if (groqModel && originalToolCalling !== undefined) {
          groqModel.capabilities.toolCalling = originalToolCalling;
        }
      }
    });

    it('uses non-streaming chat when options.stream is false on streaming model', async () => {
      const gpt4Session = createChatSession('gpt-4o', 'openai');
      const chatSpy = vi.spyOn(mockAdapter, 'chat').mockResolvedValue({
        role: 'assistant',
        content: 'Non-streamed gpt-4o response',
      });
      const streamSpy = vi.spyOn(mockAdapter, 'stream');

      await gpt4Session.sendMessage('Test', undefined, { stream: false });
      expect(streamSpy).not.toHaveBeenCalled();
      expect(chatSpy).toHaveBeenCalledWith(
        expect.objectContaining({ stream: false }),
        expect.any(AbortSignal)
      );
    });
  });
});
