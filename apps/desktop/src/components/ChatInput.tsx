import type { KeyboardEvent } from 'react';
import { useState, useRef, useCallback, useEffect, FormEvent } from 'react';
import { Send, Paperclip, Mic, Square, X, Smile } from 'lucide-react';
import type { NormalizedMessage, Attachment, ModelCapabilities } from '@prisma-ai/core/providers';

interface ChatInputProps {
  onSend: (content: string, attachments?: Attachment[]) => Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  currentModel?: string;
  currentProvider?: string;
  capabilities?: ModelCapabilities;
}

export function ChatInput({
  onSend,
  onCancel,
  disabled = false,
  isStreaming = false,
  placeholder = 'Message...',
  currentModel,
  currentProvider,
  capabilities,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [unsupportedNotice, setUnsupportedNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || disabled || isStreaming) return;

      const content = input;
      const currentAttachments = attachments.length > 0 ? attachments : undefined;

      if (currentAttachments && currentAttachments.length > 0) {
        const hasImage = currentAttachments.some(
          (a) => a.type === 'image' || a.mimeType?.startsWith('image/')
        );
        if (hasImage && capabilities?.vision === false) {
          setUnsupportedNotice(`${currentModel || 'This model'} does not support image attachments.`);
          return;
        }

        const hasFile = currentAttachments.some(
          (a) => a.type === 'file' && !a.mimeType?.startsWith('image/')
        );
        if (hasFile && capabilities?.fileInput === false) {
          setUnsupportedNotice(`${currentModel || 'This model'} does not support file attachments.`);
          return;
        }
      }

      setUnsupportedNotice(null);
      setInput('');
      setAttachments([]);
      await onSend(content, currentAttachments);
    },
    [input, disabled, isStreaming, attachments, onSend, capabilities, currentModel]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  const handleAttachmentAdd = useCallback(() => {
    if (capabilities && capabilities.vision === false && capabilities.fileInput === false) {
      setUnsupportedNotice(`${currentModel || 'This model'} does not support file or image attachments.`);
      return;
    }
    setUnsupportedNotice(null);
    setShowAttachments(!showAttachments);
  }, [capabilities, currentModel, showAttachments]);

  const handleAttachmentRemove = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleVoiceInput = useCallback(() => {
    if (capabilities && capabilities.speechToText === false) {
      setUnsupportedNotice(`${currentModel || 'This model'} does not support voice input.`);
      return;
    }
    setUnsupportedNotice(null);
    // Voice input would be implemented here
    console.log('Voice input clicked');
  }, [capabilities, currentModel]);

  const attachmentsUnsupported = Boolean(capabilities && capabilities.vision === false && capabilities.fileInput === false);
  const voiceUnsupported = Boolean(capabilities && capabilities.speechToText === false);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {unsupportedNotice && (
        <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between">
          <span>{unsupportedNotice}</span>
          <button
            type="button"
            onClick={() => setUnsupportedNotice(null)}
            className="p-1 rounded hover:bg-surface-hover text-text-tertiary"
            aria-label="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 p-4 border-t border-border bg-surface">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleAttachmentAdd}
            disabled={disabled || isStreaming}
            className={`p-2 rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50 ${
              attachmentsUnsupported ? 'text-text-tertiary opacity-60' : 'text-text-secondary'
            }`}
            aria-label="Attach file"
            title={attachmentsUnsupported ? `${currentModel} does not support attachments` : 'Attach file'}
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleVoiceInput}
            disabled={disabled || isStreaming}
            className={`p-2 rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50 ${
              voiceUnsupported ? 'text-text-tertiary opacity-60' : 'text-text-secondary'
            }`}
            aria-label="Voice input"
            title={voiceUnsupported ? `${currentModel} does not support voice input` : 'Voice input'}
          >
            <Mic className="w-5 h-5" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isStreaming}
          className="flex-1 min-h-[44px] max-h-[200px] px-4 py-3 bg-background border border-border rounded-lg text-base resize-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none disabled:opacity-50"
          rows={1}
          style={{ minHeight: '44px', maxHeight: '200px' }}
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"
            aria-label="Stop generation"
          >
            <Square className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || disabled}
            className="p-2 rounded-lg bg-accent-primary text-accent-primary-text hover:bg-accent-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div
              key={`${attachment.path}-${index}`}
              className="flex items-center gap-2 px-3 py-1 bg-surface border border-border rounded-lg text-sm"
            >
              <span className="text-text-secondary">{attachment.filename ?? attachment.path}</span>
              <span className="text-text-tertiary">({attachment.mimeType})</span>
              <button
                type="button"
                onClick={() => handleAttachmentRemove(index)}
                className="p-1 rounded hover:bg-surface-hover text-text-tertiary"
                aria-label="Remove attachment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}