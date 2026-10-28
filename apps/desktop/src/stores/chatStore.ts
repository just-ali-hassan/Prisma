/**
 * Desktop Chat Store with Database Persistence
 * 
 * Integrates with the core chat session and persists conversations to SQLite.
 */

import { create } from 'zustand';
import type { NormalizedMessage, ModelId, ProviderId } from '@prisma-ai/core/providers';
import { providerRegistry, MODEL_CAPABILITIES } from '@prisma-ai/core/providers';
import { createChatSession } from '@prisma-ai/core/chat';
import { checkEntitlement } from '@prisma-ai/core/entitlements';
import { database } from '@/utils/database';
import type { Database } from '@prisma-ai/core/db/schema';
import type { ChatSession } from '@prisma-ai/core/chat';
import { 
  createConversation, 
  getConversation, 
  getNormalizedMessages, 
  updateConversation, 
  createMessage,
  touchConversation,
  deleteMessages,
  type Conversation,
  type Message 
} from '@prisma-ai/core/db/conversations';

interface ChatState {
  // Session state
  session: ChatSession | null;
  messages: NormalizedMessage[];
  isStreaming: boolean;
  currentModel: ModelId;
  currentProvider: ProviderId;
  error: Error | null;

  // Current conversation
  currentConversationId: string | null;

  // Settings
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  systemPrompt: string;

  // Actions
  initializeSession: (model: ModelId, provider: ProviderId, conversationId?: string) => Promise<void>;
  sendMessage: (content: string, attachments?: NormalizedMessage['attachments']) => Promise<void>;
  cancelStream: () => void;
  retry: () => Promise<void>;
  setModel: (model: ModelId) => void;
  setProvider: (provider: ProviderId) => void;
  addSystemMessage: (content: string) => void;
  clearHistory: (keepSystem?: boolean) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
  setTopP: (p: number) => void;
  setFrequencyPenalty: (penalty: number) => void;
  setPresencePenalty: (penalty: number) => void;
  setSystemPrompt: (prompt: string) => void;
  clearError: () => void;

  // Export
  exportConversation: (format: 'json' | 'markdown') => string;
  generateTitle: () => string;
}

function generateConversationId(): string {
  return crypto.randomUUID();
}

function generateMessageId(): string {
  return crypto.randomUUID();
}

function serializeMessage(message: NormalizedMessage): Omit<Message, 'createdAt'> {
  return {
    id: generateMessageId(),
    conversationId: '', // Will be set by caller
    role: message.role,
    content: message.content,
    toolCalls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
    toolCallId: message.toolCallId ?? null,
    attachments: message.attachments ? JSON.stringify(message.attachments) : null,
    modelId: message.modelId ?? null,
    tokenCount: message.tokenCount ?? null,
    cost: message.cost ?? null,
    extra: message.extra ? JSON.stringify(message.extra) : null,
  };
}

function serializeParameters(
  temperature: number,
  maxTokens: number,
  topP: number,
  frequencyPenalty: number,
  presencePenalty: number
): string {
  return JSON.stringify({ temperature, maxTokens, topP, frequencyPenalty, presencePenalty });
}

function readParameters(value: string | null): Partial<Pick<ChatState, 'temperature' | 'maxTokens' | 'topP' | 'frequencyPenalty' | 'presencePenalty'>> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const number = (key: string): number | undefined =>
      typeof parsed[key] === 'number' && Number.isFinite(parsed[key]) ? parsed[key] : undefined;
    return {
      temperature: number('temperature'),
      maxTokens: number('maxTokens'),
      topP: number('topP'),
      frequencyPenalty: number('frequencyPenalty'),
      presencePenalty: number('presencePenalty'),
    };
  } catch {
    return {};
  }
}

function persistParameters(
  database: Database,
  get: () => ChatState,
): void {
  const state = get();
  if (!state.currentConversationId) return;
  void updateConversation(database, state.currentConversationId, {
    parameters: serializeParameters(
      state.temperature,
      state.maxTokens,
      state.topP,
      state.frequencyPenalty,
      state.presencePenalty,
    ),
  }).catch(console.error);
}

export const useChatStore = create<ChatState>((set, get) => ({
  session: null,
  messages: [],
  isStreaming: false,
  currentModel: 'gpt-4o',
  currentProvider: 'openai',
  error: null,
  currentConversationId: null,
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  systemPrompt: '',

  initializeSession: async (model: ModelId, provider: ProviderId, conversationId?: string) => {
    // If conversationId provided, load existing conversation
    let initialMessages: NormalizedMessage[] = [];
    let convId = conversationId ?? generateConversationId();
    let conv: Conversation | undefined;
    let activeModel = model;
    let activeProvider = provider;

    if (conversationId) {
      conv = await getConversation(database, conversationId);
      if (!conv) throw new Error(`Conversation ${conversationId} not found`);
      initialMessages = await getNormalizedMessages(database, conversationId);
      convId = conversationId;
      activeModel = conv.modelId;
      activeProvider = conv.providerId as ProviderId;
    }

    if (!providerRegistry.has(activeProvider)) {
      throw new Error(`Provider ${activeProvider} not registered`);
    }

    const session = createChatSession(activeModel, activeProvider, {
      onToken: (token) => {
        set((state) => {
          const lastMsg = state.messages[state.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            return {
              messages: [
                ...state.messages.slice(0, -1),
                { ...lastMsg, content: (lastMsg.content ?? '') + token },
              ],
            };
          }
          return {
            messages: [
              ...state.messages,
              { role: 'assistant', content: token },
            ],
          };
        });
      },
      onToolCall: (toolCalls) => {
        set((state) => {
          const lastMsg = state.messages[state.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            const existingCalls = lastMsg.toolCalls ?? [];
            return {
              messages: [
                ...state.messages.slice(0, -1),
                { ...lastMsg, toolCalls: [...existingCalls, ...toolCalls] },
              ],
            };
          }
          return {
            messages: [
              ...state.messages,
              { role: 'assistant', content: '', toolCalls: [...toolCalls] },
            ],
          };
        });
      },
      onDone: () => {
        set({ isStreaming: false });
      },
      onError: (error) => {
        set({ error, isStreaming: false });
      },
      onMessage: async (message) => {
        const { currentConversationId } = get();
        if (message.role === 'assistant') {
          set((state) => {
            const lastMsg = state.messages[state.messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              return {
                messages: [
                  ...state.messages.slice(0, -1),
                  message,
                ],
              };
            }
            return { messages: [...state.messages, message] };
          });
          if (currentConversationId) {
            const serialized = serializeMessage(message);
            serialized.conversationId = currentConversationId;
            await createMessage(database, { ...serialized, createdAt: Date.now() });
            await touchConversation(database, currentConversationId);
          }
        } else {
          set((state) => ({ messages: [...state.messages, message] }));
          // Persist user messages immediately
          if (currentConversationId && message.role === 'user') {
            const serialized = serializeMessage(message);
            serialized.conversationId = currentConversationId;
            await createMessage(database, { ...serialized, createdAt: Date.now() });
          }
        }
      },
      onTitleGenerate: async (title) => {
        const { currentConversationId } = get();
        if (currentConversationId) {
          await updateConversation(database, currentConversationId, { title });
        }
      },
    });

    // Create new conversation if not loading existing
    if (!conversationId) {
      const now = Date.now();
      const parameters = serializeParameters(
        get().temperature,
        get().maxTokens,
        get().topP,
        get().frequencyPenalty,
        get().presencePenalty
      );
      
      await createConversation(database, {
        id: convId,
        projectId: null,
        title: null,
        modelId: model,
        providerId: provider,
        systemPrompt: get().systemPrompt || null,
        parameters,
        createdAt: now,
        updatedAt: now,
      });
    }

    const savedParameters = readParameters(conv?.parameters ?? null);
    set({
      session,
      currentModel: activeModel,
      currentProvider: activeProvider,
      messages: initialMessages,
      error: null,
      currentConversationId: convId,
      temperature: savedParameters.temperature ?? get().temperature,
      maxTokens: savedParameters.maxTokens ?? get().maxTokens,
      topP: savedParameters.topP ?? get().topP,
      frequencyPenalty: savedParameters.frequencyPenalty ?? get().frequencyPenalty,
      presencePenalty: savedParameters.presencePenalty ?? get().presencePenalty,
      systemPrompt: conv?.systemPrompt ?? get().systemPrompt,
    });
  },

  sendMessage: async (content: string, attachments?: NormalizedMessage['attachments']) => {
    const { session, currentModel, currentProvider, temperature, maxTokens, topP, frequencyPenalty, presencePenalty, systemPrompt, currentConversationId } = get();

    if (!session) {
      throw new Error('Session not initialized');
    }

    if (session.isStreaming() || get().isStreaming) {
      throw new Error('Already streaming');
    }

    checkEntitlement('agents'); // Will pass at launch

    // Update conversation model/provider if changed
    if (currentConversationId) {
      await updateConversation(database, currentConversationId, {
        modelId: currentModel,
        providerId: currentProvider,
      });
    }

    const entry = MODEL_CAPABILITIES.find(m => m.id === currentModel && m.provider === currentProvider);
    const caps = entry?.capabilities;
    const isReasoning = /^(o1|o3|o4)/i.test(currentModel) || Boolean(caps?.reasoning);
    const supportsPenalties = !isReasoning && currentProvider !== 'anthropic' && currentProvider !== 'google';

    if (attachments && attachments.length > 0) {
      const hasImage = attachments.some(a => a.type === 'image' || a.mimeType?.startsWith('image/'));
      if (hasImage && caps?.vision === false) {
        const err = new Error(`${currentModel} does not support image attachments.`);
        set({ error: err, isStreaming: false });
        throw err;
      }
      const hasFile = attachments.some(a => a.type === 'file' && !a.mimeType?.startsWith('image/'));
      if (hasFile && caps?.fileInput === false) {
        const err = new Error(`${currentModel} does not support file attachments.`);
        set({ error: err, isStreaming: false });
        throw err;
      }
    }

    set({ isStreaming: true, error: null });

    try {
      await session.sendMessage(content, attachments, {
        temperature: isReasoning ? undefined : temperature,
        maxTokens,
        topP: isReasoning ? undefined : topP,
        frequencyPenalty: supportsPenalties ? frequencyPenalty : undefined,
        presencePenalty: supportsPenalties ? presencePenalty : undefined,
        systemPrompt: systemPrompt || undefined,
      });
    } catch (error) {
      if (error instanceof Error && error.name !== 'ProviderCancelledError') {
        set({ error, isStreaming: false });
      }
      throw error;
    }
  },

  cancelStream: () => {
    const { session } = get();
    if (session) {
      session.cancel();
      set({ isStreaming: false });
    }
  },

  retry: async () => {
    const { session } = get();
    if (!session) return;

    set({ error: null });
    await session.retry();
  },

  setModel: (model: ModelId) => {
    const { session, currentConversationId, isStreaming } = get();
    if (isStreaming || (session && session.isStreaming())) {
      return;
    }
    if (session) {
      session.setModel(model);
    }
    if (currentConversationId) {
      updateConversation(database, currentConversationId, { modelId: model }).catch(console.error);
    }
    set({ currentModel: model });
  },

  setProvider: (provider: ProviderId) => {
    const { session, currentConversationId, isStreaming } = get();
    if (isStreaming || (session && session.isStreaming())) {
      return;
    }
    if (session) {
      session.setProvider(provider);
    }
    if (currentConversationId) {
      updateConversation(database, currentConversationId, { providerId: provider }).catch(console.error);
    }
    set({ currentProvider: provider });
  },

  addSystemMessage: (content: string) => {
    const { session, currentConversationId } = get();
    if (session) {
      session.addSystemMessage(content);
      set((state) => ({ messages: [...state.messages, { role: 'system', content }] }));
    }
    // Persist system message
    if (currentConversationId) {
      const serialized = serializeMessage({ role: 'system', content });
      serialized.conversationId = currentConversationId;
      createMessage(database, { ...serialized, createdAt: Date.now() }).catch(console.error);
    }
  },

  clearHistory: (keepSystem = true) => {
    const { session, currentConversationId } = get();
    if (session) {
      session.clearHistory(keepSystem);
    }
    if (currentConversationId) {
      // Delete messages from database
      deleteMessages(database, currentConversationId).catch(console.error);
    }
    if (keepSystem) {
      const systemMessages = get().messages.filter((m) => m.role === 'system');
      set({ messages: systemMessages });
    } else {
      set({ messages: [] });
    }
  },

  setTemperature: (temp: number) => {
    set({ temperature: temp });
    persistParameters(database, get);
  },
  setMaxTokens: (tokens: number) => {
    set({ maxTokens: tokens });
    persistParameters(database, get);
  },
  setTopP: (p: number) => {
    set({ topP: p });
    persistParameters(database, get);
  },
  setFrequencyPenalty: (penalty: number) => {
    set({ frequencyPenalty: penalty });
    persistParameters(database, get);
  },
  setPresencePenalty: (penalty: number) => {
    set({ presencePenalty: penalty });
    persistParameters(database, get);
  },
  setSystemPrompt: (prompt: string) => {
    const { currentConversationId } = get();
    if (currentConversationId) {
      updateConversation(database, currentConversationId, { systemPrompt: prompt }).catch(console.error);
    }
    set({ systemPrompt: prompt });
  },
  clearError: () => set({ error: null }),

  // Export conversation
  exportConversation: (format: 'json' | 'markdown') => {
    const { messages, currentModel, currentProvider, systemPrompt, temperature, maxTokens, topP, frequencyPenalty, presencePenalty } = get();
    
    const exportData = {
      metadata: {
        model: currentModel,
        provider: currentProvider,
        systemPrompt,
        parameters: { temperature, maxTokens, topP, frequencyPenalty, presencePenalty },
        exportedAt: new Date().toISOString(),
        messageCount: messages.length,
      },
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        toolCallId: m.toolCallId,
        attachments: m.attachments,
        modelId: m.modelId,
        tokenCount: m.tokenCount,
        cost: m.cost,
        extra: m.extra,
      })),
    };

    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    } else {
      // Markdown format
      let md = `# Conversation Export\n\n`;
      md += `**Model:** ${currentModel} (${currentProvider})\n`;
      md += `**Exported:** ${new Date().toLocaleString()}\n`;
      md += `**Messages:** ${messages.length}\n\n`;
      
      if (systemPrompt) {
        md += `## System Prompt\n\n${systemPrompt}\n\n`;
      }
      
      md += `## Conversation\n\n`;
      
      for (const msg of messages) {
        const roleLabel = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Assistant' : msg.role === 'system' ? 'System' : 'Tool';
        md += `### ${roleLabel}\n\n`;
        if (msg.content) {
          md += `${msg.content}\n\n`;
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          md += `**Tool Calls:**\n\n`;
          for (const tc of msg.toolCalls) {
            md += `- **${tc.function.name}**: ${tc.function.arguments}\n`;
          }
          md += `\n`;
        }
      }
      
      return md;
    }
  },

  // Auto-generate conversation title from first user message
  generateTitle: () => {
    const { messages } = get();
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg && firstUserMsg.content) {
      // Truncate to first 50 chars
      return firstUserMsg.content.slice(0, 50).replace(/\n/g, ' ') + (firstUserMsg.content.length > 50 ? '...' : '');
    }
    return 'New Conversation';
  },
}));
