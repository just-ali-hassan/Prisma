import { useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, Alert, Share } from 'react-native';
import { Search, Trash2, Clock, FileText, Download, Loader2 } from 'lucide-react-native';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, getThemeColors, touchTarget } from '@/theme/tokens';
import { useColorScheme } from 'react-native';
import { Conversation, getConversations, searchMessages, deleteConversation, exportConversation } from '@/utils/database';
import { useRouter } from 'expo-router';
import { useChatStore } from '@/stores/chatStore';

export default function HistoryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = getThemeColors(isDark);
  const router = useRouter();
  const initializeSession = useChatStore((state) => state.initializeSession);

  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = getConversations();
      setConversations(result);
    } catch (e) {
      setError('Failed to load conversations');
      console.error('Failed to load conversations:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchConversations = useCallback(async (query: string) => {
    if (!query.trim()) {
      const result = getConversations();
      setConversations(result);
      return;
    }

    try {
      setIsSearching(true);
      const results = searchMessages(query);
      const uniqueConversations = new Map<string, Conversation>();
      
      for (const result of results) {
        if (!uniqueConversations.has(result.conversationId)) {
          uniqueConversations.set(result.conversationId, {
            id: result.conversationId,
            title: result.title,
            updatedAt: result.timestamp,
            messageCount: 0,
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
    Alert.alert('Delete Conversation', 'Are you sure you want to delete this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          try {
            deleteConversation(id);
            setConversations(prev => prev.filter(c => c.id !== id));
          } catch (e) {
            console.error('Failed to delete conversation:', e);
            Alert.alert('Error', 'Failed to delete conversation');
          }
        }
      }
    ]);
  };

  const handleOpenConversation = async (id: string) => {
    try {
      await initializeSession('gpt-4o', 'openai', id);
      router.navigate('/(tabs)');
    } catch (e) {
      console.error('Failed to open conversation:', e);
      Alert.alert('Error', 'Failed to open conversation');
    }
  };

  const handleExport = async (id: string, format: 'markdown' | 'json') => {
    setExportingId(id);
    try {
      const exportData = exportConversation(id);
      const md = `# Conversation Export\n\n**Model:** ${exportData.model_id} (${exportData.provider_id})\n**Exported:** ${new Date().toLocaleString()}\n**Messages:** ${exportData.messages.length}\n\n${exportData.system_prompt ? `## System Prompt\n\n${exportData.system_prompt}\n\n` : ''}## Conversation\n\n${exportData.messages.map((msg: any) => {
        const roleLabel = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Assistant' : msg.role === 'system' ? 'System' : 'Tool';
        let content = `### ${roleLabel}\n\n${msg.content || ''}\n\n`;
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          content += `**Tool Calls:**\n\n`;
          for (const tc of msg.tool_calls) {
            content += `- **${tc.function.name}**: ${tc.function.arguments}\n`;
          }
          content += '\n';
        }
        return content;
      }).join('\n')}`;
      await Share.share({
        title: `Conversation ${format === 'json' ? 'JSON' : 'Markdown'} export`,
        message: format === 'json' ? JSON.stringify(exportData, null, 2) : md,
      });
    } catch (e) {
      console.error('Export failed:', e);
      Alert.alert('Error', 'Failed to export conversation');
    } finally {
      setExportingId(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
          History
        </Text>
      </View>
      <View style={styles.searchContainer}>
        <View style={[styles.searchInput, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Search size={20} color={themeColors.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchTextInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search conversations..."
            placeholderTextColor={themeColors.textTertiary}
            editable={!isSearching}
          />
          {isSearching && (
            <Loader2 size={20} color={themeColors.textTertiary} style={styles.searchIcon} />
          )}
        </View>
      </View>
      <View style={styles.listContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Loader2 size={48} color={themeColors.accent.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: themeColors.error }]}>Error: {error}</Text>
            <TouchableOpacity 
              onPress={loadConversations}
              style={styles.retryButton}
            >
              <Text style={{ color: themeColors.accent.primary }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Clock size={48} color={themeColors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: themeColors.textSecondary }]}>
              No conversations yet
            </Text>
            <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>
              Start a chat to see history here
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            renderItem={({ item }) => (
              <View
                style={[styles.conversationItem, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              >
                <TouchableOpacity style={styles.conversationContent} onPress={() => handleOpenConversation(item.id)}>
                  <Text style={[styles.conversationTitle, { color: themeColors.textPrimary }]}>
                    {item.title || 'Untitled'}
                  </Text>
                  <Text style={[styles.conversationMeta, { color: themeColors.textTertiary }]}>
                    {new Date(item.updatedAt).toLocaleString()} · {item.messageCount} messages
                  </Text>
                </TouchableOpacity>
                <View style={styles.actionsContainer}>
                  <TouchableOpacity
                    onPress={() => handleExport(item.id, 'markdown')}
                    style={styles.actionButton}
                    disabled={exportingId === item.id}
                  >
                    <FileText size={18} color={themeColors.textTertiary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleExport(item.id, 'json')}
                    style={styles.actionButton}
                    disabled={exportingId === item.id}
                  >
                    <Download size={18} color={themeColors.textTertiary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id)}
                    style={styles.actionButton}
                  >
                    <Trash2 size={20} color={themeColors.textTertiary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Clock size={48} color={themeColors.textTertiary} />
                <Text style={[styles.emptyTitle, { color: themeColors.textSecondary }]}>
                  No conversations yet
                </Text>
                <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>
                  Start a chat to see history here
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: spacing[4],
    paddingBottom: spacing[2],
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    lineHeight: lineHeight['2xl'],
    fontWeight: fontWeight.semibold,
  },
  searchContainer: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  searchTextInput: {
    flex: 1,
    fontSize: fontSize.base,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing[2],
  },
  conversationContent: {
    flex: 1,
    minWidth: 0,
  },
  conversationTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing[1],
  },
  conversationMeta: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  actionButton: {
    padding: spacing[2],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[6],
  },
  errorText: {
    fontSize: fontSize.base,
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  retryButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    backgroundColor: '#76B900',
    borderRadius: radius.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[6],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    marginBottom: spacing[1],
  },
  emptyText: {
    fontSize: fontSize.base,
    textAlign: 'center',
  },
});
