/**
 * Tool Executor Tests
 *
 * Tests for the ToolExecutor class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolExecutor, AgentToolDefinition } from '../tool-executor';
import { createToolExecutor } from '../tool-executor';
import type { ToolCall, ToolResult } from '../../providers/types';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  const mockTool: AgentToolDefinition = {
    name: 'read_file',
    description: 'Read a file',
    parameters: { type: 'object', properties: { path: { type: 'string' } } },
    category: 'read',
  };

  const writeTool: AgentToolDefinition = {
    name: 'write_file',
    description: 'Write a file',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
    category: 'write',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    executor = createToolExecutor({
      autoApproveReadOnly: true,
      onConfirmationRequired: vi.fn().mockResolvedValue(true),
    });
  });

  describe('registerTool', () => {
    it('registers a tool', () => {
      executor.registerTool(mockTool);
      expect(executor.getTool('read_file')).toEqual(mockTool);
    });
  });

  describe('unregisterTool', () => {
    it('removes a tool', () => {
      executor.registerTool(mockTool);
      executor.unregisterTool('read_file');
      expect(executor.getTool('read_file')).toBeUndefined();
    });
  });

  describe('getAllTools', () => {
    it('returns all registered tools', () => {
      executor.registerTool(mockTool);
      executor.registerTool(writeTool);
      expect(executor.getAllTools()).toHaveLength(2);
    });
  });

  describe('execute', () => {
    it('auto-approves read-only tools', async () => {
      executor.registerTool(mockTool);

      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: { name: 'read_file', arguments: '{"path":"/test.txt"}' },
      };

      const result = await executor.execute(toolCall);

      expect(result.toolCallId).toBe('call_1');
      expect(result.isError).toBe(false);
      expect(result.content).toContain('read_file');
    });

    it('handles string return from executeTool', async () => {
      executor.registerTool(mockTool);
      (executor as unknown as { executeTool: () => Promise<string> }).executeTool = () => Promise.resolve('plain string output');

      const toolCall: ToolCall = {
        id: 'call_str',
        type: 'function',
        function: { name: 'read_file', arguments: '{}' },
      };

      const result = await executor.execute(toolCall);
      expect(result.content).toBe('plain string output');
    });

    it('requires confirmation for write tools when autoApprove is false', async () => {
      const executorNoAuto = createToolExecutor({
        autoApproveReadOnly: false,
        onConfirmationRequired: vi.fn().mockResolvedValue(true),
      });
      executorNoAuto.registerTool(writeTool);

      const toolCall: ToolCall = {
        id: 'call_2',
        type: 'function',
        function: { name: 'write_file', arguments: '{"path":"/test.txt","content":"hello"}' },
      };

      const result = await executorNoAuto.execute(toolCall);

      expect(result.toolCallId).toBe('call_2');
      expect(result.isError).toBe(false);
    });

    it('returns error for denied write tool', async () => {
      const executorDeny = createToolExecutor({
        autoApproveReadOnly: false,
        onConfirmationRequired: vi.fn().mockResolvedValue(false),
      });
      executorDeny.registerTool(writeTool);

      const toolCall: ToolCall = {
        id: 'call_3',
        type: 'function',
        function: { name: 'write_file', arguments: '{"path":"/test.txt","content":"hello"}' },
      };

      const result = await executorDeny.execute(toolCall);

      expect(result.toolCallId).toBe('call_3');
      expect(result.isError).toBe(true);
      expect(result.content).toBe('User denied this action');
    });

    it('returns error for unknown tool', async () => {
      const toolCall: ToolCall = {
        id: 'call_4',
        type: 'function',
        function: { name: 'unknown_tool', arguments: '{}' },
      };

      const result = await executor.execute(toolCall);

      expect(result.toolCallId).toBe('call_4');
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Tool not found');
    });

    it('handles invalid JSON arguments', async () => {
      executor.registerTool(mockTool);

      const toolCall: ToolCall = {
        id: 'call_5',
        type: 'function',
        function: { name: 'read_file', arguments: 'invalid json' },
      };

      const result = await executor.execute(toolCall);

      expect(result.toolCallId).toBe('call_5');
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Error executing tool');
    });

    it('handles non-string execution result and non-Error exception', async () => {
      executor.registerTool(mockTool);
      (executor as unknown as { executeTool: () => Promise<unknown> }).executeTool = () => {
        return Promise.resolve({ success: true, count: 42 });
      };

      const result = await executor.execute({
        id: 'call_obj',
        type: 'function',
        function: { name: 'read_file', arguments: 'null' },
      });
      expect(result.content).toBe('{"success":true,"count":42}');

      (executor as unknown as { executeTool: () => Promise<unknown> }).executeTool = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject('Plain string error');
      };

      const errResult = await executor.execute({
        id: 'call_str_err',
        type: 'function',
        function: { name: 'read_file', arguments: '{}' },
      });
      expect(errResult.content).toContain('Plain string error');
    });
  });

  describe('requiresConfirmation', () => {
    it('returns false for read-only tools with autoApprove', () => {
      executor.registerTool(mockTool);
      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: { name: 'read_file', arguments: '{}' },
      };

      expect(executor.requiresConfirmation(toolCall)).toBe(false);
    });

    it('returns true for write tools', () => {
      executor.registerTool(writeTool);
      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: { name: 'write_file', arguments: '{}' },
      };

      expect(executor.requiresConfirmation(toolCall)).toBe(true);
    });

    it('returns true for unknown tools', () => {
      const toolCall: ToolCall = {
        id: 'call_1',
        type: 'function',
        function: { name: 'unknown', arguments: '{}' },
      };

      expect(executor.requiresConfirmation(toolCall)).toBe(true);
    });
  });
});