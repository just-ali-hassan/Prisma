/**
 * Message Normalizer Tests
 *
 * Tests for the message normalization utilities.
 */

import { describe, it, expect } from 'vitest';
import { normalizeMessage, normalizeToolCalls, normalizeAttachments, createMessageNormalizer } from '../message-normalizer';
import type { NormalizedMessage, ToolCall, Attachment } from '../../providers/types';

describe('Message Normalizer', () => {
  describe('normalizeMessage', () => {
    it('normalizes basic user message', () => {
      const raw = { role: 'user', content: 'Hello' };
      const result = normalizeMessage('openai', raw);

      expect(result).toEqual({
        role: 'user',
        content: 'Hello',
        toolCalls: undefined,
        toolCallId: undefined,
        attachments: undefined,
        extra: { role: 'user', content: 'Hello' },
      });
    });

    it('normalizes assistant message', () => {
      const raw = { role: 'assistant', content: 'Hi there!' };
      const result = normalizeMessage('openai', raw);

      expect(result).toEqual({
        role: 'assistant',
        content: 'Hi there!',
        toolCalls: undefined,
        toolCallId: undefined,
        attachments: undefined,
        extra: { role: 'assistant', content: 'Hi there!' },
      });
    });

    it('normalizes system message', () => {
      const raw = { role: 'system', content: 'You are helpful' };
      const result = normalizeMessage('openai', raw);

      expect(result.role).toBe('system');
      expect(result.content).toBe('You are helpful');
    });

    it('normalizes tool message', () => {
      const raw = { role: 'tool', content: 'Result', tool_call_id: 'call_123' };
      const result = normalizeMessage('openai', raw);

      expect(result).toEqual({
        role: 'tool',
        content: 'Result',
        toolCalls: undefined,
        toolCallId: 'call_123',
        attachments: undefined,
        extra: { role: 'tool', content: 'Result', tool_call_id: 'call_123' },
      });
    });

    it('handles content as array (Anthropic style)', () => {
      const raw = {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', id: 'call_1', name: 'tool', input: {} },
        ],
      };
      const result = normalizeMessage('anthropic', raw);

      expect(result.content).toBe('Hello');
    });

    it('handles null content', () => {
      const raw = { role: 'assistant', content: null };
      const result = normalizeMessage('openai', raw);

      expect(result.content).toBeNull();
    });

    it('handles undefined content', () => {
      const raw = { role: 'assistant' };
      const result = normalizeMessage('openai', raw);

      expect(result.content).toBeNull();
    });

    it('handles numeric, boolean, and object content', () => {
      expect(normalizeMessage('openai', { role: 'user', content: 123 }).content).toBe('123');
      expect(normalizeMessage('openai', { role: 'user', content: true }).content).toBe('true');
      expect(normalizeMessage('openai', { role: 'user', content: { data: 'val' } }).content).toBe('{"data":"val"}');
      expect(normalizeMessage('openai', { role: 'user', content: ['str', 42, { other: 'type' }] }).content).toBe('str');
    });

    it('preserves extra fields', () => {
      const raw = { role: 'user', content: 'Hi', custom_field: 'custom_value' };
      const result = normalizeMessage('openai', raw);

      expect(result.extra).toEqual({ role: 'user', content: 'Hi', custom_field: 'custom_value' });
    });

    it('handles unrecognized and non-string roles by defaulting to assistant', () => {
      const unrecognized = normalizeMessage('openai', { role: 'unknown_role', content: 'Hi' });
      expect(unrecognized.role).toBe('assistant');

      const nonString = normalizeMessage('openai', { role: 12345, content: 'Hi' });
      expect(nonString.role).toBe('assistant');
    });

    it('normalizes non-object rawMessage to assistant message', () => {
      const result = normalizeMessage('openai', 'plain text');
      expect(result.role).toBe('assistant');
      expect(result.content).toBe('plain text');
    });
  });

  describe('normalizeToolCalls', () => {
    it('normalizes OpenAI format tool calls', () => {
      const raw = [
        {
          id: 'call_123',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
        },
      ];

      const result = normalizeToolCalls(raw);

      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
      });
    });

    it('normalizes Anthropic format tool calls', () => {
      const raw = [
        {
          id: 'call_123',
          name: 'get_weather',
          input: { location: 'NYC' },
        },
      ];

      const result = normalizeToolCalls(raw);

      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
      });
    });

    it('handles tool calls with arguments as object', () => {
      const raw = [
        {
          id: 'call_123',
          type: 'function',
          function: { name: 'get_weather', arguments: { location: 'NYC' } },
        },
      ];

      const result = normalizeToolCalls(raw);

      expect(result).toHaveLength(1);
      expect(result![0].function.arguments).toBe('{"location":"NYC"}');
    });

    it('handles tool calls with arguments as direct string', () => {
      const raw = [
        {
          id: 'call_123',
          name: 'get_weather',
          arguments: '{"location":"NYC"}',
        },
      ];

      const result = normalizeToolCalls(raw);
      expect(result![0].function.arguments).toBe('{"location":"NYC"}');
    });

    it('handles tool calls with id on function object', () => {
      const raw = [
        {
          function: { id: 'call_nested', name: 'get_weather', arguments: '{}' },
        },
      ];

      const result = normalizeToolCalls(raw);
      expect(result![0].id).toBe('call_nested');
    });

    it('returns undefined for null/undefined', () => {
      expect(normalizeToolCalls(null)).toBeUndefined();
      expect(normalizeToolCalls(undefined)).toBeUndefined();
    });

    it('returns undefined for non-array', () => {
      expect(normalizeToolCalls('not an array')).toBeUndefined();
      expect(normalizeToolCalls({})).toBeUndefined();
    });

    it('filters out invalid tool calls', () => {
      const raw = [
        null,
        123,
        { id: 'call_1', type: 'function', function: { name: 'valid', arguments: '{}' } },
        { invalid: true },
        { id: 'call_2', type: 'function', function: { name: 'also_valid', arguments: { nested: true } } },
      ];

      const result = normalizeToolCalls(raw);

      expect(result).toHaveLength(2);
      expect(result![0].id).toBe('call_1');
      expect(result![1].id).toBe('call_2');
      expect(result![1].function.arguments).toBe('{"nested":true}');
    });
  });

  describe('normalizeAttachments', () => {
    it('normalizes image attachments', () => {
      const raw = [
        {
          type: 'image',
          path: 'data:image/png;base64,abc123',
          mime_type: 'image/png',
          filename: 'image.png',
        },
      ];

      const result = normalizeAttachments(raw);

      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({
        type: 'image',
        path: 'data:image/png;base64,abc123',
        mimeType: 'image/png',
        filename: 'image.png',
      });
    });

    it('normalizes file attachments', () => {
      const raw = [
        {
          type: 'file',
          path: '/path/to/document.pdf',
          mime_type: 'application/pdf',
          filename: 'document.pdf',
        },
      ];

      const result = normalizeAttachments(raw);

      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({
        type: 'file',
        path: '/path/to/document.pdf',
        mimeType: 'application/pdf',
        filename: 'document.pdf',
      });
    });

    it('handles alternative field names', () => {
      const raw = [
        {
          type: 'image',
          url: 'https://example.com/image.png',
          mime: 'image/png',
          name: 'image.png',
        },
      ];

      const result = normalizeAttachments(raw);

      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({
        type: 'image',
        path: 'https://example.com/image.png',
        mimeType: 'image/png',
        filename: 'image.png',
      });
    });

    it('returns undefined for null/undefined', () => {
      expect(normalizeAttachments(null)).toBeUndefined();
      expect(normalizeAttachments(undefined)).toBeUndefined();
    });

    it('returns undefined for non-array', () => {
      expect(normalizeAttachments('not an array')).toBeUndefined();
    });

    it('filters out invalid attachments', () => {
      const raw = [
        { type: 'image', path: 'data:image/png;base64,abc', mime_type: 'image/png' },
        { invalid: true },
        { type: 'file', path: '/path/to/doc.pdf', mime_type: 'application/pdf' },
      ];

      const result = normalizeAttachments(raw);

      expect(result).toHaveLength(2);
    });

    it('covers all attachment edge branches', () => {
      const raw = [
        null,
        123,
        { type: 'file', path: { complex: 'path' }, mime_type: { complex: 'mime' }, filename: 456 },
        { type: 'file', path: 'path', mime_type: 'mime' },
      ];
      const result = normalizeAttachments(raw);
      expect(result).toHaveLength(2);
      expect(result![0].path).toBe('{"complex":"path"}');
      expect(result![0].mimeType).toBe('{"complex":"mime"}');
      expect(result![0].filename).toBe('456');
      expect(result![1].filename).toBeUndefined();

      expect(normalizeAttachments([null, 123, {}])).toBeUndefined();
    });
  });

  describe('createMessageNormalizer', () => {
    it('creates normalizer with provider-specific fromProvider', () => {
      const normalizer = createMessageNormalizer('openai');

      const result = normalizer.fromProvider({ role: 'user', content: 'Hi' });

      expect(result).toEqual({
        role: 'user',
        content: 'Hi',
        toolCalls: undefined,
        toolCallId: undefined,
        attachments: undefined,
        extra: { role: 'user', content: 'Hi' },
      });
    });

    it('provides basic toProvider implementation', () => {
      const normalizer = createMessageNormalizer('openai');

      const messages: NormalizedMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!', toolCalls: undefined },
      ];

      const result = normalizer.toProvider(messages);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello', tool_calls: undefined, tool_call_id: undefined });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi!', tool_calls: undefined, tool_call_id: undefined });
    });
  });
});