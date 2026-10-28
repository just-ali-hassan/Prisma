import { Search, Trash2, Clock, Loader2, FileText, Download } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/stores/chatStore';

interface Conversation {
  id: string;
  title: string | null;
  updated_at: number;
  message_count: number;
}

interface SearchResult {
  conversation_id: string;
  title: string | null;
  snippet: string;
  timestamp: number;
  message_id: string;
}

interface ExportMessage {
  role: string;
  content: string | null;
  tool_calls?: { function: { name: string; arguments: string } }[] | null;
}

interface ExportConversation {
  id: string;
  title: string | null;
  model_id: string;
  provider_id: string;
  system_prompt: string | null;
  parameters: unknown;
  created_at: number;
  updated_at: number;
  messages: ExportMessage[];
}

async function downloadConversation(id: string, format: 'markdown' | 'json'): Promise<void> {
  const data = await invoke<ExportConversation>('export_conversation', { id });
  const content = format === 'json'
    ? JSON.stringify(data, null, 2)
    : [
        `# ${data.title || 'Conversation Export'}`,
        '',
        `**Model:** ${data.model_id} (${data.provider_id})`,
        `**Messages:** ${data.messages.length}`,
        data.system_prompt ? `\n## System Prompt\n\n${data.system_prompt}` : '',
        '## Conversation',
        ...data.messages.flatMap((message) => {
          const role = message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Assistant' : message.role;
          const lines = [`### ${role}`, '', message.content ?? '', ''];
          if (message.tool_calls?.length) {
            lines.push('**Tool Calls:**', '');
            for (const toolCall of message.tool_calls) {
              lines.push(`- **${toolCall.function.name}**: ${toolCall.function.arguments}`);
            }
            lines.push('');
          }
          return lines;
        }),
      ].filter(Boolean).join('\n');
  const mimeType = format === 'json' ? 'application/json' : 'text/markdown';
  const extension = format === 'json' ? 'json' : 'md';
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `conversation-${data.id.slice(0, 8)}.${extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function History() {
  const navigate = useNavigate();
  const initializeSession = useChatStore((state) => state.initializeSession);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load conversations on mount
  const loadConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await invoke<Conversation[]>('get_conversations');
      setConversations(result);
    } catch (e) {
      setError('Failed to load conversations');
      console.error('Failed to load conversations:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Search conversations
  const searchConversations = useCallback(async (query: string) => {
    if (!query.trim()) {
      loadConversations();
      return;
    }

    try {
      setIsSearching(true);
      const results = await invoke<SearchResult[]>('search_messages', { query });
      // Convert search results to conversation format
      const uniqueConversations = new Map<string, Conversation>();
      
      for (const result of results) {
        if (!uniqueConversations.has(result.conversation_id)) {
          uniqueConversations.set(result.conversation_id, {
            title: result.title,
            id: result.conversation_id,
            updated_at: result.timestamp,
            message_count: 0,
          });
        }
      }
      
      setConversations(Array.from(uniqueConversations.values()));
    } catch (e) {
      console.error('Search failed:', e);
      setError('Search failed');
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchConversations(searchQuery);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery, searchConversations]);

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_conversation', { id });
      setConversations(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      console.error('Failed to delete conversation:', e);
      alert('Failed to delete conversation');
    }
  };

  const handleOpenConversation = async (id: string) => {
    try {
      await initializeSession('gpt-4o', 'openai', id);
      navigate('/chat');
    } catch (e) {
      console.error('Failed to open conversation:', e);
      setError('Failed to open conversation');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <h1 className="text-xl font-semibold text-text-primary mb-4">History</h1>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-base focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none"
            disabled={isSearching}
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary animate-spin" />
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-error">
            <p>Error: {error}</p>
            <button 
              onClick={loadConversations}
              className="mt-2 text-sm underline hover:text-accent-primary"
            >
              Retry
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 text-text-secondary">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No conversations yet</p>
            <p className="text-sm mt-1">Start a chat to see history here</p>
          </div>
        ) : (
          <ul className="space-y-2 max-w-3xl mx-auto" role="list">
            {conversations.map((conv) => (
              <li
                key={conv.id}
                className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg hover:border-border-hover transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => handleOpenConversation(conv.id)}
                    className="font-medium text-text-primary truncate text-left hover:text-accent-primary"
                    title="Open conversation"
                  >{conv.title || 'Untitled'}</button>
                  <p className="text-sm text-text-tertiary mt-0.5">
                    {new Date(conv.updated_at).toLocaleString()} · {conv.message_count} messages
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => void downloadConversation(conv.id, 'markdown').catch(console.error)}
                    className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary transition-colors"
                    aria-label="Export as Markdown"
                    title="Export as Markdown"
                  >
                    <FileText width="18" height="18" />
                  </button>
                  <button
                    onClick={() => void downloadConversation(conv.id, 'json').catch(console.error)}
                    className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary transition-colors"
                    aria-label="Export as JSON"
                    title="Export as JSON"
                  >
                    <Download width="18" height="18" />
                  </button>
                  <button
                    onClick={() => handleDelete(conv.id)}
                    className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-error transition-colors ml-2"
                    aria-label="Delete conversation"
                  >
                    <Trash2 width="18" height="18" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
