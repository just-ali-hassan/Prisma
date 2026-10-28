/**
 * Mobile Chat Store with Database Persistence
 * 
 * Integrates with the core chat session and persists conversations to SQLite.
 */

import { create } from 'zustand';
import { createChatSession } from '@prisma-ai/core/chat';
import type { ModelId, ProviderId, NormalizedMessage } from '@prisma-ai/core/providers';
import { providerRegistry, MODEL_CAPABILITIES } from '@prisma-ai/core/providers';
import { checkEntitlement } from '@prisma-ai/core/entitlements';
import { 
  initializeDatabase,
  getConversation,
  getNormalizedMessages, 
  updateConversation, 
  createMessage,
  touchConversation,
  createConversation,
  deleteMessages,
  type ConversationFull,
} from '@/utils/database';

interface ChatState {
  session: ReturnType<typeof createChatSession> | null;
  messages: NormalizedMessage[];
  isStreaming: boolean;
  currentModel: ModelId;
  currentProvider: ProviderId;
  error: Error | null;
  currentConversationId: string | null;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  systemPrompt: string;

  initializeSession: (model: ModelId, provider: ProviderId, conversationId?: string) => Promise<void>;
  sendMessage: (content: string, attachments?: NormalizedMessage['attachments']) => Promise<void>;
  cancelStream: () => void;
  retry: () => Promise<void>;
  setModel: (model: ModelId) => void;
  setProvider: (provider: ProviderId) => void;
  setTemperature: (value: number) => void;
  setMaxTokens: (value: number) => void;
  setTopP: (value: number) => void;
  setFrequencyPenalty: (value: number) => void;
  setPresencePenalty: (value: number) => void;
  setSystemPrompt: (value: string) => void;
  clearError: () => void;
  clearHistory: (keepSystem?: boolean) => void;
  addSystemMessage: (content: string) => void;
}

function generateConversationId(): string {
  return crypto.randomUUID();
}

function generateMessageId(): string {
  return crypto.randomUUID();
}

function serializeMessage(message: NormalizedMessage, conversationId: string) {
  return {
    id: generateMessageId(),
    conversationId,
    role: message.role,
    content: message.content,
    toolCalls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
    toolCallId: message.toolCallId ?? null,
    attachments: message.attachments ? JSON.stringify(message.attachments) : null,
    modelId: message.modelId ?? null,
    tokenCount: message.tokenCount ?? null,
    cost: message.cost ?? null,
    extra: message.extra ? JSON.stringify(message.extra) : null,
    createdAt: Date.now(),
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

function persistParameters(get: () => ChatState): void {
  const state = get();
  if (!state.currentConversationId) return;
  updateConversation(state.currentConversationId, {
    parameters: serializeParameters(
      state.temperature,
      state.maxTokens,
      state.topP,
      state.frequencyPenalty,
      state.presencePenalty,
    ),
  });
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
    // Ensure database is initialized
    initializeDatabase();

    // If conversationId provided, load existing conversation
    let initialMessages: NormalizedMessage[] = [];
    let convId = conversationId ?? generateConversationId();
    let conv: ConversationFull | undefined;
    let activeModel = model;
    let activeProvider = provider;

    if (conversationId) {
      conv = getConversation(conversationId);
      if (!conv) throw new Error(`Conversation ${conversationId} not found`);
      initialMessages = getNormalizedMessages(conversationId);
      convId = conversationId;
      activeModel = conv.model_id;
      activeProvider = conv.provider_id as ProviderId;
    }
    if (!providerRegistry.has(activeProvider)) {
      throw new Error(`Provider ${activeProvider} not registered`);
    }

    const session = createChatSession(activeModel, activeProvider, {
      onToken: (token) => {
        set((state) => {
          if (state.messages.length > 0 && state.messages[state.messages.length - 1].role === 'assistant') {
            const lastMsg = state.messages[state.messages.length - 1];
            return {
              messages: [
                ...state.messages.slice(0, -1),
                { ...lastMsg, content: (lastMsg.content ?? '') + token },
              ],
            };
          }
          return { messages: [...state.messages, { role: 'assistant', content: token }] };
        });
      },
      onToolCall: (toolCalls) => {
        set((state) => {
          if (state.messages.length > 0 && state.messages[state.messages.length - 1].role === 'assistant') {
            const lastMsg = state.messages[state.messages.length - 1];
            return {
              messages: [
                ...state.messages.slice(0, -1),
                { ...lastMsg, toolCalls: [...(lastMsg.toolCalls ?? []), ...toolCalls] },
              ],
            };
          }
          return state;
        });
      },
      onDone: () => {
        set({ isStreaming: false });
      },
      onError: (error) => {
        if (error.name !== 'ProviderCancelledError') {
          set({ error, isStreaming: false });
        }
      },
      onMessage: async (message) => {
        const { currentConversationId } = get();
        set((state) => {
          const lastMessage = state.messages[state.messages.length - 1];
          if (message.role === 'assistant' && lastMessage?.role === 'assistant') {
            return { messages: [...state.messages.slice(0, -1), message] };
          }
          return { messages: [...state.messages, message] };
        });
        if (currentConversationId && message.role === 'assistant') {
          createMessage(serializeMessage(message, currentConversationId));
          touchConversation(currentConversationId);
        }
        
        // Persist user messages immediately
        if (currentConversationId && message.role === 'user') {
          const serialized = serializeMessage(message, currentConversationId);
          createMessage(serialized);
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
      
      createConversation({
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
      systemPrompt: conv?.system_prompt ?? get().systemPrompt,
    });
  },

  sendMessage: async (content: string, attachments?: NormalizedMessage['attachments']) => {
    const { session, currentModel, currentProvider, temperature, maxTokens, topP, frequencyPenalty, presencePenalty, systemPrompt, currentConversationId } = get();

    if (!session) {
      throw new Error('Session not initialized');
    }

    if (session.isStreaming()) {
      throw new Error('Already streaming');
    }

    checkEntitlement('agents'); // Will pass at launch

    // Update conversation model/provider if changed
    if (currentConversationId) {
      updateConversation(currentConversationId, {
        model_id: currentModel,
        provider_id: currentProvider,
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
        model: currentModel,
        provider: currentProvider,
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
    const { session, currentConversationId } = get();
    if (session) {
      session.setModel(model);
    }
    if (currentConversationId) {
      updateConversation(currentConversationId, { model_id: model });
    }
    set({ currentModel: model });
  },

  setProvider: (provider: ProviderId) => {
    const { session, currentConversationId } = get();
    if (session) {
      session.setProvider(provider);
    }
    if (currentConversationId) {
      updateConversation(currentConversationId, { provider_id: provider });
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
      const serialized = serializeMessage({ role: 'system', content }, currentConversationId);
      createMessage(serialized);
    }
  },

  clearHistory: (keepSystem = true) => {
    const { session, currentConversationId } = get();
    if (session) {
      session.clearHistory(keepSystem);
    }
    if (currentConversationId) {
      // Delete messages from database
      deleteMessages(currentConversationId);
    }
    if (keepSystem) {
      const systemMessages = get().messages.filter((m) => m.role === 'system');
      set({ messages: systemMessages });
    } else {
      set({ messages: [] });
    }
  },

  setTemperature: (value: number) => { set({ temperature: value }); persistParameters(get); },
  setMaxTokens: (value: number) => { set({ maxTokens: value }); persistParameters(get); },
  setTopP: (value: number) => { set({ topP: value }); persistParameters(get); },
  setFrequencyPenalty: (value: number) => { set({ frequencyPenalty: value }); persistParameters(get); },
  setPresencePenalty: (value: number) => { set({ presencePenalty: value }); persistParameters(get); },
  setSystemPrompt: (value: string) => {
    const { currentConversationId } = get();
    if (currentConversationId) {
      updateConversation(currentConversationId, { system_prompt: value });
    }
    set({ systemPrompt: value });
  },
  clearError: () => set({ error: null }),
}));
