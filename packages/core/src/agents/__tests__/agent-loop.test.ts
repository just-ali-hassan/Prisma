/**
 * Agent Loop Tests
 *
 * Tests for the AgentLoop class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop, createAgentLoop } from '../agent-loop';
import { providerRegistry } from '../../providers/registry';
import { OpenAIAdapter } from '../../providers/adapters/openai.adapter';
import type { NormalizedMessage, StreamEvent, ToolCall, TokenUsage, ModelId, ProviderId } from '../../providers/types';
import { ProviderCancelledError } from '../../providers/types';

describe('AgentLoop', () => {
  let mockAdapter: OpenAIAdapter;
  let mockKeyManager: { getKey: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    providerRegistry.clear();
    mockKeyManager = { getKey: vi.fn().mockResolvedValue('sk-test-key') };
    mockAdapter = new OpenAIAdapter(mockKeyManager);
    providerRegistry.register(mockAdapter);
  });

  describe('createAgentLoop', () => {
    it('creates agent loop instance', () => {
      const loop = createAgentLoop([], 'gpt-4o', 'openai', {
        maxSteps: 5,
        autoApproveReadOnly: true,
      });

      expect(loop).toBeInstanceOf(AgentLoop);
      expect(loop.getState().isRunning).toBe(false);
      expect(loop.getState().maxSteps).toBe(5);
    });
  });

  describe('getState', () => {
    it('returns initial state', () => {
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 10, autoApproveReadOnly: true });
      const state = loop.getState();

      expect(state.isRunning).toBe(false);
      expect(state.currentStep).toBe(0);
      expect(state.maxSteps).toBe(10);
      expect(state.stopRequested).toBe(false);
      expect(state.messages).toEqual([]);
      expect(state.totalUsage).toBeNull();
      expect(state.totalCost).toBe(0);
    });
  });

  describe('run', () => {
    it('throws if already running', async () => {
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 5, autoApproveReadOnly: true });

      // Mock a stream that never completes
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          // Keep promise pending
          const timer = setTimeout(resolve, 10000);
          return () => clearTimeout(timer);
        });
      });

      const promise = loop.run('Hello');
      await new Promise(r => setTimeout(r, 10));

      await expect(loop.run('World')).rejects.toThrow('Agent loop already running');
    });

    it('stops when stop is called', async () => {
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 10, autoApproveReadOnly: true });

      let abortSignal: AbortSignal;
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, _onEvent, signal) => {
        abortSignal = signal;
        // Wait for abort
        await new Promise<void>((_, reject) => {
          signal.addEventListener('abort', () => reject(new ProviderCancelledError('openai')));
        });
      });

      const promise = loop.run('Hello');
      await new Promise(r => setTimeout(r, 10));

      loop.stop();
      // Trigger abort
      abortSignal?.dispatchEvent(new Event('abort'));

      await expect(promise).rejects.toThrow(ProviderCancelledError);
    });

    it('completes conversation without tool calls and accumulates usage', async () => {
      const onToken = vi.fn();
      const onStep = vi.fn();
      const onDone = vi.fn();

      const loop = createAgentLoop([], 'gpt-4o', 'openai', {
        maxSteps: 3,
        autoApproveReadOnly: true,
        onToken,
        onStep,
        onDone,
      });

      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({ type: 'token', content: 'Assistant answer' });
        onEvent({
          type: 'done',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });
      });

      await loop.run('Hello');

      expect(onStep).toHaveBeenCalledWith(1, 3);
      expect(onToken).toHaveBeenCalledWith('Hello');
      expect(onToken).toHaveBeenCalledWith('Assistant answer');
      expect(onDone).toHaveBeenCalledWith({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });

      const state = loop.getState();
      expect(state.currentStep).toBe(1);
      expect(state.totalUsage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
      expect(state.messages).toHaveLength(2);
      expect(state.messages[1].role).toBe('assistant');
      expect(state.messages[1].content).toBe('Assistant answer');
    });

    it('executes tool calls and continues loop until completion', async () => {
      let stepCount = 0;
      const onToolCall = vi.fn();
      const onToolResult = vi.fn();

      const loop = createAgentLoop([], 'gpt-4o', 'openai', {
        maxSteps: 5,
        autoApproveReadOnly: true,
        onToolCall,
        onToolResult,
      });

      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        stepCount++;
        if (stepCount === 1) {
          onEvent({
            type: 'tool_call',
            toolCalls: [
              { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"file.txt"}' } },
            ],
          });
          onEvent({ type: 'done', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } });
        } else {
          onEvent({ type: 'token', content: 'Here is the file content' });
          onEvent({ type: 'done', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } });
        }
      });

      await loop.run('Read file.txt');

      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(onToolResult).toHaveBeenCalledWith('call_1', expect.stringContaining('read_file'), false);
      expect(loop.getState().messages).toHaveLength(4); // user, assistant with tool, tool result, assistant final
      expect(loop.getState().totalUsage).toEqual({ promptTokens: 10, completionTokens: 10, totalTokens: 20 });
    });

    it('handles tool execution failures gracefully', async () => {
      const onToolResult = vi.fn();
      const loop = createAgentLoop([], 'gpt-4o', 'openai', {
        maxSteps: 3,
        autoApproveReadOnly: true,
        onToolResult,
      });

      let stepCount = 0;
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        stepCount++;
        if (stepCount === 1) {
          onEvent({
            type: 'tool_call',
            toolCalls: [
              { id: 'call_err', type: 'function', function: { name: 'search', arguments: '{}' } },
            ],
          });
          onEvent({ type: 'done' });
        } else {
          onEvent({ type: 'token', content: 'Handled error' });
          onEvent({ type: 'done' });
        }
      });

      // Override executeTool to throw
      (loop as unknown as { executeTool: () => Promise<string> }).executeTool = () => {
        return Promise.reject(new Error('Tool failed'));
      };

      await loop.run('Run failing tool');

      expect(onToolResult).toHaveBeenCalledWith('call_err', 'Tool failed', true);
    });

    it('triggers onError when maxSteps is exceeded', async () => {
      const onError = vi.fn();
      const loop = createAgentLoop([], 'gpt-4o', 'openai', {
        maxSteps: 2,
        autoApproveReadOnly: true,
        onError,
      });

      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({
          type: 'tool_call',
          toolCalls: [{ id: 'call_loop', type: 'function', function: { name: 'search', arguments: '{}' } }],
        });
        onEvent({ type: 'done' });
      });

      await loop.run('Loop forever');

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Max steps (2) reached' }));
    });

    it('handles stream error in agent loop', async () => {
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 3, autoApproveReadOnly: true });

      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({ type: 'error', error: new Error('Stream crashed') });
      });

      await expect(loop.run('Trigger stream error')).rejects.toThrow('Stream crashed');
    });

    it('handles denied non-read-only tool when autoApproveReadOnly is true', async () => {
      const onToolResult = vi.fn();
      const loop = createAgentLoop([], 'gpt-4o', 'openai', {
        maxSteps: 3,
        autoApproveReadOnly: true,
        onToolResult,
      });

      let stepCount = 0;
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        stepCount++;
        if (stepCount === 1) {
          onEvent({
            type: 'tool_call',
            toolCalls: [
              { id: 'call_write', type: 'function', function: { name: 'write_file', arguments: '{}' } },
            ],
          });
          onEvent({ type: 'done' });
        } else {
          onEvent({ type: 'token', content: 'Understood denial' });
          onEvent({ type: 'done' });
        }
      });

      await loop.run('Write to disk');
      expect(onToolResult).toHaveBeenCalledWith('call_write', 'User denied', true);
      const toolMsg = loop.getState().messages.find((m) => m.role === 'tool');
      expect(toolMsg?.content).toBe('User denied this action');
    });

    it('handles handleDone with usage', () => {
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 3, autoApproveReadOnly: true });
      (loop as unknown as { handleDone: (u: TokenUsage) => void }).handleDone({
        promptTokens: 2,
        completionTokens: 3,
        totalTokens: 5,
      });
      expect(loop.getState().totalUsage).toEqual({
        promptTokens: 2,
        completionTokens: 3,
        totalTokens: 5,
      });
    });

    it('stops mid-stream when stop() is called', async () => {
      const onStop = vi.fn();
      const loop = createAgentLoop([], 'gpt-4o', 'openai', {
        maxSteps: 3,
        autoApproveReadOnly: true,
        onStop,
      });

      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        loop.stop();
        onEvent({ type: 'token', content: 'hello' });
      });

      await expect(loop.run('Test stop')).rejects.toThrow('Stopped');
      expect(onStop).toHaveBeenCalled();
      expect(loop.getState().stopRequested).toBe(true);
    });

    it('executes read-only tool using default executeTool implementation', async () => {
      const onToolResult = vi.fn();
      const loop = createAgentLoop([], 'gpt-4o', 'openai', {
        maxSteps: 3,
        autoApproveReadOnly: true,
        onToolResult,
      });

      let step = 0;
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        step++;
        if (step === 1) {
          onEvent({
            type: 'tool_call',
            toolCalls: [
              { id: 'call_search', type: 'function', function: { name: 'search', arguments: '{"q":"test"}' } },
            ],
          });
          onEvent({ type: 'done' });
        } else {
          onEvent({ type: 'token', content: 'Found it' });
          onEvent({ type: 'done' });
        }
      });

      await loop.run('Find something');
      expect(onToolResult).toHaveBeenCalledWith('call_search', expect.stringContaining('Executed search'), false);
    });

    it('handles internal chatSession callbacks', () => {
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 1, autoApproveReadOnly: true });
      const internalSession = (loop as unknown as { chatSession: { options: { onMessage?: (msg: unknown) => void; onDone?: (usage?: TokenUsage) => void } } }).chatSession;
      internalSession.options.onMessage?.({ role: 'assistant', content: 'test message' });
      expect(loop.getState().messages).toContainEqual({ role: 'assistant', content: 'test message' });
      internalSession.options.onDone?.({ promptTokens: 1, completionTokens: 1, totalTokens: 2 });
      expect(loop.getState().totalUsage).toEqual({ promptTokens: 1, completionTokens: 1, totalTokens: 2 });
    });

    it('breaks tool execution loop when stopRequested is set', async () => {
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 3, autoApproveReadOnly: true });
      let step = 0;
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        step++;
        if (step === 1) {
          onEvent({
            type: 'tool_call',
            toolCalls: [
              { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
              { id: 'call_2', type: 'function', function: { name: 'search', arguments: '{}' } },
            ],
          });
          onEvent({ type: 'done' });
        }
      });
      (loop as unknown as { executeTool: () => Promise<string> }).executeTool = () => {
        loop.stop();
        return Promise.resolve('ok');
      };

      await loop.run('Run two tools');
      const toolMessages = loop.getState().messages.filter((m) => m.role === 'tool');
      expect(toolMessages).toHaveLength(1);
    });

    it('approves tool when autoApproveReadOnly is false', async () => {
      const onToolResult = vi.fn();
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 2, autoApproveReadOnly: false, onToolResult });
      let step = 0;
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        step++;
        if (step === 1) {
          onEvent({
            type: 'tool_call',
            toolCalls: [{ id: 'call_w', type: 'function', function: { name: 'write_file', arguments: '{}' } }],
          });
          onEvent({ type: 'done' });
        } else {
          onEvent({ type: 'token', content: 'done' });
          onEvent({ type: 'done' });
        }
      });
      await loop.run('Test non auto approve');
      expect(onToolResult).toHaveBeenCalledWith('call_w', expect.any(String), false);
    });

    it('handles non-Error thrown in executeTool', async () => {
      const onToolResult = vi.fn();
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 2, autoApproveReadOnly: true, onToolResult });
      let step = 0;
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        step++;
        if (step === 1) {
          onEvent({
            type: 'tool_call',
            toolCalls: [{ id: 'call_err2', type: 'function', function: { name: 'search', arguments: '{}' } }],
          });
          onEvent({ type: 'done' });
        } else {
          onEvent({ type: 'token', content: 'handled' });
          onEvent({ type: 'done' });
        }
      });
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      (loop as unknown as { executeTool: () => Promise<string> }).executeTool = () => Promise.reject('string failure');
      await loop.run('Test string error');
      expect(onToolResult).toHaveBeenCalledWith('call_err2', 'string failure', true);
    });

    it('calls onDone with undefined when no usage was accumulated', async () => {
      const onDone = vi.fn();
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 2, autoApproveReadOnly: true, onDone });
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({ type: 'token', content: 'hi' });
        onEvent({ type: 'done' });
      });
      await loop.run('No usage message');
      expect(onDone).toHaveBeenCalledWith(undefined);
    });

    it('handles stream events with undefined toolCalls and error', async () => {
      const onToolCall = vi.fn();
      const loop = createAgentLoop([], 'gpt-4o', 'openai', { maxSteps: 2, autoApproveReadOnly: true, onToolCall });
      vi.spyOn(mockAdapter, 'stream').mockImplementation(async (_req, onEvent) => {
        onEvent({ type: 'token' });
        onEvent({ type: 'tool_call' });
        onEvent({ type: 'error' });
      });
      await expect(loop.run('Test undefined fields')).rejects.toThrow('Stream error');
      expect(onToolCall).toHaveBeenCalledWith([]);
    });
  });
});