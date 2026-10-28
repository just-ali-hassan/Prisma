import { useEffect, useCallback, useState } from 'react';
import { Sparkles, MessageSquare, Settings, SlidersHorizontal, FileText, Download, Plus } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatInput } from '@/components/ChatInput';
import { ModelPicker } from '@/components/ModelPicker';
import { ParameterPanel } from '@/components/ParameterPanel';
import type { ProviderId } from '@prisma-ai/core/providers';
import { isModelUsable, MODEL_CAPABILITIES } from '@prisma-ai/core/providers';
import { invoke } from '@tauri-apps/api/core';

export function Chat() {
  const {
    session,
    messages,
    isStreaming,
    currentModel,
    currentProvider,
    error,
    initializeSession,
    sendMessage,
    cancelStream,
    retry,
    setModel,
    setProvider,
    temperature,
    maxTokens,
    topP,
    frequencyPenalty,
    presencePenalty,
    systemPrompt,
    exportConversation,
  } = useChatStore();

  const [showParameters, setShowParameters] = useState(false);

  // Initialize session on mount
  useEffect(() => {
    if (!session) {
      initializeSession('gpt-4o', 'openai');
    }
  }, [session, initializeSession]);

  const handleSend = useCallback(
    async (content: string, attachments?: Parameters<typeof sendMessage>[1]) => {
      await sendMessage(content, attachments);
    },
    [sendMessage],
  );

  const handleRetry = useCallback(async () => {
    await retry();
  }, [retry]);

  const handleModelChange = useCallback((modelId: string, providerId: string) => {
    if (isStreaming) return;
    if (!isModelUsable(providerId, modelId)) return;
    setModel(modelId);
    setProvider(providerId as ProviderId);
  }, [isStreaming, setModel, setProvider]);

  const handleNewChat = useCallback(() => {
    if (isStreaming) return;
    initializeSession(currentModel, currentProvider);
  }, [isStreaming, initializeSession, currentModel, currentProvider]);

  if (!session) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="max-w-3xl mx-auto text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-primary/10 mb-4">
              <Sparkles className="w-8 h-8 text-accent-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-text-primary mb-2">Welcome to Prisma</h2>
            <p className="text-text-secondary max-w-md mx-auto">
              Start a conversation by typing a message below. Choose your model and provider in Settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header with Model Picker */}
      <header className="flex items-center justify-between h-12 px-4 border-b border-border bg-surface/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-text-primary">Prisma</h1>
          <button
            onClick={handleNewChat}
            disabled={isStreaming}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent-primary text-accent-primary-text hover:bg-accent-primary-hover disabled:opacity-50 text-xs font-medium transition-colors"
            title="Start a new conversation"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
          <ModelPicker
            selectedModel={currentModel}
            selectedProvider={currentProvider}
            onSelect={handleModelChange}
            disabled={isStreaming}
            className="ml-1"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const content = exportConversation('markdown');
              const blob = new Blob([content], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `conversation-${Date.now()}.md`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
            aria-label="Export as Markdown"
            title="Export as Markdown"
          >
            <FileText className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              const content = exportConversation('json');
              const blob = new Blob([content], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `conversation-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
            aria-label="Export as JSON"
            title="Export as JSON"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowParameters(true)}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
            aria-label="Open parameters"
            title="Parameters (Ctrl+P)"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
          <button
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="max-w-3xl mx-auto text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-primary/10 mb-4">
              <MessageSquare className="w-8 h-8 text-accent-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-text-primary mb-2">New Conversation</h2>
            <p className="text-text-secondary max-w-md mx-auto">
              Model: <strong>{currentModel}</strong> via <strong>{currentProvider}</strong>
            </p>
            <p className="text-text-tertiary text-sm mt-2">Type a message to begin</p>
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((message, index) => (
            <ChatBubble
              key={`${message.role}-${index}-${message.content?.slice(0, 20)}`}
              message={message}
              isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
              onCopy={(content) => navigator.clipboard.writeText(content)}
            />
          ))}

          {error && (
            <div className="max-w-3xl mx-auto p-4 bg-error/10 border border-error/30 rounded-lg text-error text-center">
              <p>{error.message}</p>
              <button
                onClick={handleRetry}
                className="mt-2 text-sm underline hover:text-accent-primary"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      <ChatInput
        onSend={handleSend}
        onCancel={cancelStream}
        isStreaming={isStreaming}
        placeholder={`Message ${currentModel}...`}
        currentModel={currentModel}
        currentProvider={currentProvider}
        capabilities={MODEL_CAPABILITIES.find(m => m.id === currentModel && m.provider === currentProvider)?.capabilities}
      />

      <ParameterPanel
        isOpen={showParameters}
        onClose={() => setShowParameters(false)}
      />
    </div>
  );
}