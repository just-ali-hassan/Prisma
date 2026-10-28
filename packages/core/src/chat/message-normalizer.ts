/**
 * Message Normalizer
 *
 * Converts provider-specific message formats to internal NormalizedMessage format.
 * Each adapter should use this to normalize responses before returning.
 */

import type { NormalizedMessage, ToolCall, Attachment, Role } from '../providers/types';

/**
 * Normalize a message from any provider to our internal format.
 * Provider adapters should call this for each message in responses.
 */
export function normalizeMessage(providerId: string, rawMessage: unknown): NormalizedMessage {
  // Base normalization - providers should override with provider-specific logic
  if (typeof rawMessage === 'object' && rawMessage !== null) {
    const msg = rawMessage as Record<string, unknown>;

    return {
      role: normalizeRole(msg.role),
      content: normalizeContent(msg.content),
      toolCalls: normalizeToolCalls(msg.tool_calls ?? msg.toolCalls),
      toolCallId: (msg.tool_call_id ?? msg.toolCallId) as string | undefined,
      attachments: normalizeAttachments(msg.attachments),
      extra: { ...msg }, // Preserve all original fields
    };
  }

  // Fallback for unexpected formats
  return {
    role: 'assistant',
    content: String(rawMessage),
    extra: { raw: rawMessage },
  };
}

/**
 * Normalize role to our standard roles.
 */
function normalizeRole(role: unknown): Role {
  if (typeof role === 'string') {
    switch (role.toLowerCase()) {
      case 'user':
      case 'human':
        return 'user';
      case 'assistant':
      case 'model':
      case 'ai':
        return 'assistant';
      case 'system':
        return 'system';
      case 'tool':
      case 'function':
        return 'tool';
      default:
        return 'assistant';
    }
  }
  return 'assistant';
}

/**
 * Normalize content to string or null.
 */
function normalizeContent(content: unknown): string | null {
  if (content === null || content === undefined) {
    return null;
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    // Handle content arrays (e.g., Anthropic's content blocks)
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (typeof block === 'object' && block !== null) {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') return b.text;
          if (b.type === 'tool_use') return ''; // Tool calls handled separately
        }
        return '';
      })
      .join('');
  }
  if (typeof content === 'number' || typeof content === 'boolean') return `${content}`;
  return JSON.stringify(content);
}

/**
 * Normalize tool calls to our standard format.
 */
export function normalizeToolCalls(toolCalls: unknown): ToolCall[] | undefined {
  if (!toolCalls) return undefined;
  if (!Array.isArray(toolCalls)) return undefined;

  return toolCalls
    .map((tc) => {
      if (typeof tc !== 'object' || tc === null) return null;
      const t = tc as Record<string, unknown>;

      // Handle different provider formats
      let id: string | undefined;
      let name: string | undefined;
      let args: string | undefined;

      if (typeof t.id === 'string') {
        id = t.id;
      } else if (
        typeof t.function === 'object' &&
        t.function !== null &&
        typeof (t.function as Record<string, unknown>).id === 'string'
      ) {
        id = (t.function as Record<string, unknown>).id as string;
      }

      if (typeof t.name === 'string') {
        name = t.name;
      } else if (
        typeof t.function === 'object' &&
        t.function !== null &&
        typeof (t.function as Record<string, unknown>).name === 'string'
      ) {
        name = (t.function as Record<string, unknown>).name as string;
      }

      // Handle Anthropic's 'input' field (used instead of 'arguments')
      if (typeof t.arguments === 'string') {
        args = t.arguments;
      } else if (
        typeof t.function === 'object' &&
        t.function !== null &&
        typeof (t.function as Record<string, unknown>).arguments === 'string'
      ) {
        args = (t.function as Record<string, unknown>).arguments as string;
      } else if (typeof t.input === 'object' && t.input !== null) {
        // Anthropic uses 'input' instead of 'arguments'
        args = JSON.stringify(t.input);
      } else if (
        t.arguments !== undefined ||
        (typeof t.function === 'object' &&
          t.function !== null &&
          (t.function as Record<string, unknown>).arguments !== undefined)
      ) {
        const rawArgs =
          t.arguments ??
          (t.function as Record<string, unknown>).arguments;
        args = JSON.stringify(rawArgs);
      }

      if (id && name && args !== undefined) {
        return {
          id,
          type: 'function' as const,
          function: { name, arguments: args },
        };
      }
      return null;
    })
    .filter((tc): tc is ToolCall => tc !== null);
}

/**
 * Normalize attachments to our standard format.
 */
export function normalizeAttachments(attachments: unknown): Attachment[] | undefined {
  if (!attachments) return undefined;
  if (!Array.isArray(attachments)) return undefined;

  const result: Attachment[] = [];
  for (const att of attachments) {
    if (typeof att !== 'object' || att === null) continue;
    const a = att as Record<string, unknown>;

    const type = typeof a.type === 'string' ? a.type.toLowerCase() : undefined;
    const rawPath = a.path ?? a.url ?? a.data;
    const rawMime = a.mime_type ?? a.mimeType ?? a.mime;
    const rawFilename = a.filename ?? a.name;

    if (!type || !rawPath || !rawMime) continue;

    const pathStr = typeof rawPath === 'string' ? rawPath : JSON.stringify(rawPath);
    const mimeStr = typeof rawMime === 'string' ? rawMime : JSON.stringify(rawMime);
    const fileStr = typeof rawFilename === 'string' ? rawFilename : rawFilename != null ? JSON.stringify(rawFilename) : undefined;

    result.push({
      type: type === 'image' ? 'image' : 'file',
      path: pathStr,
      mimeType: mimeStr,
      filename: fileStr,
    });
  }

  return result.length > 0 ? result : undefined;
}

/**
 * Convert internal NormalizedMessage to provider-specific format.
 * Each adapter should implement its own version.
 */
export interface MessageNormalizer {
  toProvider(messages: NormalizedMessage[]): unknown[];
  fromProvider(providerMessage: unknown): NormalizedMessage;
}

/**
 * Create a message normalizer for a specific provider.
 */
export function createMessageNormalizer(providerId: string): MessageNormalizer {
  return {
    toProvider(messages: NormalizedMessage[]) {
      // Base implementation - providers should override
      return messages.map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls,
        tool_call_id: m.toolCallId,
      }));
    },
    fromProvider(providerMessage: unknown) {
      return normalizeMessage(providerId, providerMessage);
    },
  };
}
