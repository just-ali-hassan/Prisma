import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { MessageSquare, Bot, Wrench, Copy, Check, X, AlertCircle } from 'lucide-react';
import type { NormalizedMessage, ToolCall } from '@prisma-ai/core/providers';

interface ChatBubbleProps {
  message: NormalizedMessage;
  isStreaming?: boolean;
  onCopy?: (content: string) => void;
  onRetryTool?: (toolCallId: string) => void;
}

function ToolCallCard({ toolCall, status = 'pending' }: { toolCall: ToolCall; status?: 'pending' | 'success' | 'error' }) {
  const statusColors = {
    pending: 'border-warning text-warning',
    success: 'border-success text-success',
    error: 'border-error text-error',
  };

  const statusIcons = {
    pending: <AlertCircle className="w-4 h-4 animate-spin" />,
    success: <Check className="w-4 h-4" />,
    error: <X className="w-4 h-4" />,
  };

  return (
    <div className={`tool-call-card ${status}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4" />
          <span className="font-medium text-text-primary">{toolCall.function.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[status]}`}>
            {statusIcons[status]}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        <details className="group">
          <summary className="cursor-pointer text-text-tertiary hover:text-text-secondary">
            Arguments
          </summary>
          <pre className="mt-2 p-2 bg-background border border-border rounded text-xs overflow-x-auto text-text-secondary">
            {toolCall.function.arguments}
          </pre>
        </details>
      </div>
    </div>
  );
}

function MessageHeader({ message }: { message: NormalizedMessage }) {
  const roleIcons: Record<string, React.ReactNode> = {
    user: <MessageSquare className="w-4 h-4" />,
    assistant: <Bot className="w-4 h-4" />,
    system: <AlertCircle className="w-4 h-4" />,
    tool: <Wrench className="w-4 h-4" />,
    developer: <Bot className="w-4 h-4" />,
  };

  const roleLabels: Record<string, string> = {
    user: 'You',
    assistant: 'Assistant',
    system: 'System',
    tool: 'Tool Result',
    developer: 'Developer',
  };

  return (
    <div className="flex items-center gap-2 mb-2 text-sm">
      <div className="w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center">
        {roleIcons[message.role] ?? roleIcons.user}
      </div>
      <span className="font-medium text-text-primary">{roleLabels[message.role] ?? roleLabels.user}</span>
      {message.modelId && (
        <span className="text-text-tertiary">{message.modelId}</span>
      )}
      {message.tokenCount && (
        <span className="text-text-tertiary">· {message.tokenCount} tokens</span>
      )}
      {message.cost && message.cost > 0 && (
        <span className="text-text-tertiary">· ${message.cost.toFixed(4)}</span>
      )}
    </div>
  );
}

export function ChatBubble({ message, isStreaming, onCopy, onRetryTool }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  if (isTool) {
    return (
      <div className={`w-full ${isUser ? 'ml-auto' : 'mr-auto'} max-w-3xl`}>
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`relative max-w-[85%] px-4 py-3 rounded-2xl ${
              isUser
                ? 'bg-accent-primary text-accent-primary-text rounded-br-md'
                : 'bg-surface border border-border rounded-bl-md'
            }`}
          >
            <MessageHeader message={message} />
            <div className="text-text-secondary font-mono text-sm whitespace-pre-wrap">
              {message.content ?? ''}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isAssistant && message.toolCalls && message.toolCalls.length > 0) {
    return (
      <div className={`w-full ${isUser ? 'ml-auto' : 'mr-auto'} max-w-3xl`}>
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`relative max-w-[85%] px-4 py-3 rounded-2xl ${
              isUser
                ? 'bg-accent-primary text-accent-primary-text rounded-br-md'
                : 'bg-surface border border-border rounded-bl-md'
            }`}
          >
            <MessageHeader message={message} />
            {message.content && (
              <ReactMarkdown
                rehypePlugins={[rehypeSanitize]}
                className="markdown-content mt-2"
              >
                {message.content}
              </ReactMarkdown>
            )}
            <div className="mt-3 space-y-2">
              {message.toolCalls.map((toolCall) => (
                <ToolCallCard key={toolCall.id} toolCall={toolCall} status="pending" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${isUser ? 'ml-auto' : 'mr-auto'} max-w-3xl animate-fade-in`}>
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`relative max-w-[85%] px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-accent-primary text-accent-primary-text rounded-br-md'
              : 'bg-surface border border-border rounded-bl-md'
          }`}
        >
          {!isUser && <MessageHeader message={message} />}
          <div className={isUser ? 'mt-0' : 'mt-2'}>
            {message.content ? (
              <ReactMarkdown
                rehypePlugins={[rehypeSanitize]}
                className="markdown-content"
              >
                {message.content}
              </ReactMarkdown>
            ) : isStreaming && (
              <div className="flex items-center gap-2 text-text-tertiary">
                <span className="streaming-indicator" />
                <span>Generating...</span>
              </div>
            )}
          </div>
          {(isAssistant || isUser) && message.content && onCopy && (
            <button
              onClick={() => onCopy(message.content!)}
              className="absolute top-2 right-2 p-1 rounded hover:bg-black/10 hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
              aria-label="Copy message"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
          {isStreaming && !isUser && (
            <div className="absolute bottom-1 right-2 flex items-center gap-1 text-text-tertiary text-xs">
              <span className="streaming-indicator" />
              <span>Streaming...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}