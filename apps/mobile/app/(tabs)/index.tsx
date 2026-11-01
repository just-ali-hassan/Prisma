import { useEffect, useCallback, useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native';
import { Send, Paperclip, Mic, Square, Sparkles, MessageSquare, SlidersHorizontal, Image as LucideImage, FileText } from 'lucide-react-native';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, touchTarget, getThemeColors } from '@/theme/tokens';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { useChatStore } from '@/stores/chatStore';
import { ModelPicker } from '@/components/ModelPicker';
import { ParameterSheet } from '@/components/ParameterSheet';
import type { NormalizedMessage, ProviderId, Attachment } from '@prisma-ai/core/providers';
import { isModelUsable, MODEL_CAPABILITIES } from '@prisma-ai/core/providers';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { getFileInfo, validateFile, arrayBufferToBase64 } from '@prisma-ai/core/utils';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = getThemeColors(isDark);
  const styles = createStyles(themeColors);

  const {
    session,
    messages,
    isStreaming,
    currentModel,
    currentProvider,
    temperature,
    maxTokens,
    topP,
    frequencyPenalty,
    presencePenalty,
    systemPrompt,
    error,
    initializeSession,
    sendMessage,
    cancelStream,
    retry,
    setModel,
    setProvider,
    setTemperature,
    setMaxTokens,
    setTopP,
    setFrequencyPenalty,
    setPresencePenalty,
    setSystemPrompt,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [showAttachments, setShowAttachments] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showParameterSheet, setShowParameterSheet] = useState(false);
  const [attachments, setAttachments] = useState<NonNullable<NormalizedMessage['attachments']>>([]);
  const [pickingFile, setPickingFile] = useState(false);

  const selectedEntry = MODEL_CAPABILITIES.find(
    (m) => m.id === currentModel && m.provider === currentProvider
  );
  const caps = selectedEntry?.capabilities;

  const pickImage = useCallback(async () => {
    if (caps?.vision === false) {
      Alert.alert('Not Supported', `${selectedEntry?.name ?? currentModel} does not support image attachments.`);
      return;
    }
    setPickingFile(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          const fileInfo = getFileInfo(asset.mimeType ?? 'image/jpeg', asset.fileName ?? 'image.jpg', asset.fileSize ?? 0);
          const validationError = validateFile(asset.mimeType ?? 'image/jpeg', fileInfo.name, asset.fileSize ?? 0);
          if (validationError) {
            Alert.alert('Invalid File', validationError);
            return;
          }

          const attachment: Attachment = {
            type: 'image',
            path: `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`,
            mimeType: asset.mimeType ?? 'image/jpeg',
            filename: asset.fileName ?? 'image.jpg',
          };

          setAttachments((prev) => [...prev, attachment]);
        }
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to pick image');
    } finally {
      setPickingFile(false);
    }
  }, [caps, currentModel, selectedEntry]);

  const pickDocument = useCallback(async () => {
    if (caps?.fileInput === false) {
      Alert.alert('Not Supported', `${selectedEntry?.name ?? currentModel} does not support file attachments.`);
      return;
    }
    setPickingFile(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/*', 'application/json', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          const fileInfo = getFileInfo(asset.mimeType ?? 'application/octet-stream', asset.name ?? 'file', asset.size ?? 0);
          const validationError = validateFile(asset.mimeType ?? 'application/octet-stream', fileInfo.name, asset.size ?? 0);
          if (validationError) {
            Alert.alert('Invalid File', validationError);
            return;
          }

          const attachment: Attachment = {
            type: 'file',
            path: base64,
            mimeType: asset.mimeType ?? 'application/octet-stream',
            filename: asset.name ?? 'file',
          };

          setAttachments((prev) => [...prev, attachment]);
        };
        reader.readAsDataURL(blob);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to pick document');
    } finally {
      setPickingFile(false);
    }
  }, [caps, currentModel, selectedEntry]);

  useEffect(() => {
    if (!session) {
      initializeSession('gpt-4o', 'openai');
    }
  }, [session, initializeSession]);

  const handleModelSelect = useCallback(
    (model: string, provider: string) => {
      if (isStreaming) return;
      if (!isModelUsable(provider as ProviderId, model)) return;
      setModel(model);
      setProvider(provider as ProviderId);
      setShowModelPicker(false);
    },
    [isStreaming, setModel, setProvider]
  );

  const handleAttachmentPress = useCallback(() => {
    if (caps && caps.vision === false && caps.fileInput === false) {
      Alert.alert(
        'Not Supported',
        `${selectedEntry?.name ?? currentModel} does not support file or image attachments.`
      );
      return;
    }
    // Show action sheet to pick image or document
    Alert.alert(
      'Attach File',
      'Choose file type',
      [
        { text: 'Image', onPress: pickImage },
        { text: 'Document', onPress: pickDocument },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  }, [caps, selectedEntry, currentModel, pickImage, pickDocument]);

  const handleVoicePress = useCallback(() => {
    if (caps && caps.speechToText === false) {
      Alert.alert(
        'Not Supported',
        `${selectedEntry?.name ?? currentModel} does not support voice input.`
      );
      return;
    }
  }, [caps, selectedEntry, currentModel]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    
    const content = input;
    const currentAttachments = attachments.length > 0 ? attachments : undefined;

    if (currentAttachments && currentAttachments.length > 0) {
      const hasImage = currentAttachments.some(
        (a) => a.type === 'image' || a.mimeType?.startsWith('image/')
      );
      if (hasImage && caps?.vision === false) {
        Alert.alert(
          'Not Supported',
          `${selectedEntry?.name ?? currentModel} does not support image attachments.`
        );
        return;
      }

      const hasFile = currentAttachments.some(
        (a) => a.type === 'file' && !a.mimeType?.startsWith('image/')
      );
      if (hasFile && caps?.fileInput === false) {
        Alert.alert(
          'Not Supported',
          `${selectedEntry?.name ?? currentModel} does not support file attachments.`
        );
        return;
      }
    }
    
    setInput('');
    setAttachments([]);
    
    try {
      await sendMessage(content, currentAttachments);
    } catch (e) {
      console.error('Send failed:', e);
    }
  }, [input, isStreaming, attachments, sendMessage, caps, selectedEntry, currentModel]);

  const handleRetry = useCallback(async () => {
    await retry();
  }, [retry]);

  if (!session) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.scrollView}>
          <View style={styles.welcomeContainer}>
            <View style={[styles.welcomeIcon, { backgroundColor: `${themeColors.accent.primary}1A` }]}>
              <Sparkles size={32} color={themeColors.accent.primary} />
            </View>
            <Text style={[styles.welcomeTitle, { color: themeColors.textPrimary }]}>
              Welcome to Prisma
            </Text>
            <Text style={[styles.welcomeText, { color: themeColors.textSecondary }]}>
              Start a conversation by typing a message below. Choose your model and provider in Settings.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header with Model Button and Parameter Button */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing[2]) }]}>
        <ModelPicker
          selectedModel={currentModel}
          selectedProvider={currentProvider}
          onSelect={handleModelSelect}
          disabled={isStreaming}
          isOpen={showModelPicker}
          onOpen={() => {
            if (!isStreaming) setShowModelPicker(true);
          }}
          onClose={() => setShowModelPicker(false)}
          style={styles.modelPickerTrigger}
        />

        <TouchableOpacity
          style={[
            styles.paramButton,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              opacity: isStreaming ? 0.6 : 1,
            },
          ]}
          onPress={() => setShowParameterSheet(true)}
          disabled={isStreaming}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open parameter settings"
        >
          <SlidersHorizontal size={18} color={themeColors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Parameter Bottom Sheet */}
      <ParameterSheet
        isOpen={showParameterSheet}
        onClose={() => setShowParameterSheet(false)}
        temperature={temperature}
        maxTokens={maxTokens}
        topP={topP}
        frequencyPenalty={frequencyPenalty}
        presencePenalty={presencePenalty}
        systemPrompt={systemPrompt}
        currentModel={currentModel}
        currentProvider={currentProvider}
        setTemperature={setTemperature}
        setMaxTokens={setMaxTokens}
        setTopP={setTopP}
        setFrequencyPenalty={setFrequencyPenalty}
        setPresencePenalty={setPresencePenalty}
        setSystemPrompt={setSystemPrompt}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && (
          <View style={styles.welcomeContainer}>
            <View style={[styles.welcomeIcon, { backgroundColor: `${themeColors.accent.primary}1A` }]}>
              <Sparkles size={32} color={themeColors.accent.primary} />
            </View>
            <Text style={[styles.welcomeTitle, { color: themeColors.textPrimary }]}>
              New Conversation
            </Text>
            <Text style={[styles.welcomeText, { color: themeColors.textSecondary }]}>
              Model: <Text style={{ fontWeight: fontWeight.semibold }}>{currentModel}</Text> via <Text style={{ fontWeight: fontWeight.semibold }}>{currentProvider}</Text>
            </Text>
            <Text style={[styles.welcomeText, { color: themeColors.textTertiary }]}>
              Type a message to begin
            </Text>
          </View>
        )}

        <View style={styles.messagesContainer}>
          {messages.map((message, index) => (
            <ChatBubble
              key={`${message.role}-${index}-${message.content?.slice(0, 20)}`}
              message={message}
              isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
              themeColors={themeColors}
              styles={styles}
              onCopy={(content) => {
                // Clipboard would be set here
              }}
            />
          ))}

          {error && (
            <View style={[styles.errorContainer, { backgroundColor: `${themeColors.error}1A`, borderColor: themeColors.error }]}>
              <Text style={{ color: themeColors.error }}>{error.message}</Text>
              <TouchableOpacity
                onPress={retry}
                style={styles.retryButton}
              >
                <Text style={{ color: themeColors.accent.primary }}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.inputContainer, { backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
        <View style={styles.inputRow}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleAttachmentPress}
            disabled={isStreaming}
            accessibilityLabel="Attach file"
          >
            <Paperclip size={22} color={themeColors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleVoicePress}
            disabled={isStreaming}
            accessibilityLabel="Voice input"
          >
            <Mic size={22} color={themeColors.textSecondary} />
          </TouchableOpacity>
          <TextInput
            style={[styles.textInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.textPrimary }]}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            placeholder="Message..."
            placeholderTextColor={themeColors.textTertiary}
            multiline
            editable={!isStreaming}
          />
          {isStreaming ? (
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: `${themeColors.error}1A` }]}
              onPress={cancelStream}
              accessibilityLabel="Stop generation"
            >
              <Square size={22} color={themeColors.error} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: input.trim() ? themeColors.accent.primary : themeColors.border }]}
              onPress={handleSend}
              disabled={!input.trim() || isStreaming}
              accessibilityLabel="Send message"
            >
              <Send size={22} color={input.trim() ? themeColors.accent.primaryText : themeColors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        {attachments.length > 0 && (
          <View style={[styles.attachmentsContainer, { backgroundColor: themeColors.surface }]}>
            {attachments.map((attachment, index) => (
              <View key={`${attachment.path}-${index}`} style={styles.attachmentItem}>
                <Text style={[styles.attachmentName, { color: themeColors.textSecondary }]}>{attachment.filename ?? attachment.path}</Text>
                <TouchableOpacity
                  onPress={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                  style={styles.removeButton}
                >
                  <Text style={{ color: themeColors.textTertiary }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <Text style={[styles.inputHint, { color: themeColors.textTertiary }]}>
          Press Enter to send, Shift+Enter for new line
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function ChatBubble({ message, isStreaming, themeColors, styles, onCopy }: { 
  message: any; 
  isStreaming: boolean; 
  themeColors: any;
  styles: ReturnType<typeof createStyles>;
  onCopy?: (content: string) => void;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  const renderAttachments = (attachments: any[]) => {
    if (!attachments || attachments.length === 0) return null;
    return (
      <View style={styles.bubbleAttachmentsContainer}>
        {attachments.map((attachment: any, index: number) => (
          <View key={`${attachment.path}-${index}`} style={styles.bubbleAttachmentItem}>
            {attachment.type === 'image' && attachment.path.startsWith('data:') ? (
              <Image
                source={{ uri: attachment.path }}
                style={styles.attachmentImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.attachmentFile}>
                <LucideImage size={20} color={themeColors.textSecondary} />
                <View style={styles.attachmentFileInfo}>
                  <Text style={[styles.bubbleAttachmentName, { color: themeColors.textSecondary }]}>{attachment.filename ?? attachment.path}</Text>
                  <Text style={[styles.attachmentMeta, { color: themeColors.textTertiary }]}>{attachment.mimeType}</Text>
                </View>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  if (isTool) {
    return (
      <View style={[styles.bubbleContainer, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUserStyle : styles.bubbleAssistantStyle]}>
          <Text style={[styles.toolContent, { color: themeColors.textSecondary }]}>
            {message.content ?? ''}
          </Text>
        </View>
      </View>
    );
  }

  if (isAssistant && message.toolCalls && message.toolCalls.length > 0) {
    return (
      <View style={[styles.bubbleContainer, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUserStyle : styles.bubbleAssistantStyle]}>
          {message.content && (
            <Markdown style={{ body: { color: themeColors.textPrimary, fontSize: fontSize.base, lineHeight: lineHeight.base } }}>
              {message.content}
            </Markdown>
          )}
          <View style={styles.toolCallsContainer}>
            {message.toolCalls.map((toolCall: any) => (
              <View key={toolCall.id} style={styles.toolCallCard}>
                <Text style={[styles.toolCallName, { color: themeColors.textPrimary }]}>{toolCall.function.name}</Text>
                <Text style={[styles.toolCallArgs, { color: themeColors.textSecondary }]}>{toolCall.function.arguments}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleContainer, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUserStyle : styles.bubbleAssistantStyle]}>
        {message.attachments && message.attachments.length > 0 && (
          <View style={styles.messageAttachments}>
            {renderAttachments(message.attachments)}
          </View>
        )}
        {isAssistant && message.content ? (
          <Markdown style={{ body: { color: themeColors.textPrimary, fontSize: fontSize.base, lineHeight: lineHeight.base } }}>
            {message.content}
          </Markdown>
        ) : (
          <Text style={[styles.messageContent, { color: isUser ? themeColors.accent.primaryText : themeColors.textPrimary }]}>
            {message.content ?? (isStreaming ? 'Generating...' : '')}
          </Text>
        )}
        {!isUser && (message.tokenCount !== undefined || message.cost !== undefined) && (
          <Text style={{ color: themeColors.textTertiary, fontSize: fontSize.xs, marginTop: spacing[2] }}>
            {message.tokenCount !== undefined ? `${message.tokenCount} tokens` : ''}
            {message.tokenCount !== undefined && message.cost !== undefined ? ' · ' : ''}
            {message.cost !== undefined ? `$${message.cost.toFixed(4)}` : ''}
          </Text>
        )}
        {isStreaming && !isUser && (
          <View style={styles.streamingIndicator}>
            <View style={styles.streamingDot} />
            <Text style={{ color: themeColors.textTertiary, fontSize: 12 }}>Generating...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(themeColors: ReturnType<typeof getThemeColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      paddingBottom: spacing[2],
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
      backgroundColor: themeColors.surface,
    },
    modelPickerTrigger: {
      flex: 1,
    },
    paramButton: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      padding: spacing[4],
      justifyContent: 'center',
      alignItems: 'center',
    },
    welcomeContainer: {
      alignItems: 'center',
      paddingHorizontal: spacing[6],
    },
    welcomeIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing[4],
    },
    welcomeTitle: {
      fontSize: fontSize['2xl'],
      lineHeight: lineHeight['2xl'],
      fontWeight: fontWeight.semibold,
      textAlign: 'center',
      marginBottom: spacing[2],
    },
    welcomeText: {
      fontSize: fontSize.base,
      lineHeight: lineHeight.base,
      textAlign: 'center',
    },
    messagesContainer: {
      maxWidth: '100%',
    },
    bubbleContainer: {
      width: '100%',
      marginBottom: spacing[3],
    },
    bubbleUser: {
      alignSelf: 'flex-end',
    },
    bubbleAssistant: {
      alignSelf: 'flex-start',
    },
    bubble: {
      maxWidth: '85%',
      padding: spacing[3],
      borderRadius: radius.lg,
    },
    bubbleUserStyle: {
      backgroundColor: themeColors.accent.primary,
      borderBottomRightRadius: radius.sm,
    },
    bubbleAssistantStyle: {
      backgroundColor: themeColors.surface,
      borderWidth: 1,
      borderColor: themeColors.border,
      borderBottomLeftRadius: radius.sm,
    },
    messageContent: {
      fontSize: fontSize.base,
      lineHeight: lineHeight.base,
    },
    toolContent: {
      fontSize: fontSize.sm,
      lineHeight: lineHeight.sm,
      fontFamily: 'monospace',
    },
    toolCallsContainer: {
      marginTop: spacing[3],
      gap: spacing[2],
    },
    toolCallCard: {
      padding: spacing[3],
      borderRadius: radius.md,
      backgroundColor: themeColors.background,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    toolCallName: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      marginBottom: spacing[1],
    },
    toolCallArgs: {
      fontSize: fontSize.xs,
      fontFamily: 'monospace',
    },
    streamingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[1],
      marginTop: spacing[2],
      paddingTop: spacing[2],
      borderTopWidth: 1,
      borderTopColor: themeColors.border,
    },
    streamingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: themeColors.accent.primary,
    },
    errorContainer: {
      padding: spacing[3],
      borderRadius: radius.md,
      borderWidth: 1,
      marginBottom: spacing[3],
    },
    retryButton: {
      marginTop: spacing[2],
      paddingVertical: spacing[1],
      paddingHorizontal: spacing[3],
      backgroundColor: themeColors.accent.primary,
      borderRadius: radius.sm,
    },
    inputContainer: {
      padding: spacing[4],
      borderTopWidth: 1,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing[2],
    },
    iconButton: {
      width: touchTarget,
      height: touchTarget,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius.md,
    },
    textInput: {
      flex: 1,
      minHeight: 44,
      paddingVertical: spacing[3],
      paddingHorizontal: spacing[4],
      borderRadius: radius.md,
      borderWidth: 1,
      fontSize: fontSize.base,
      lineHeight: lineHeight.base,
    },
    sendButton: {
      width: touchTarget,
      height: touchTarget,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius.md,
    },
    attachmentsContainer: {
      paddingHorizontal: spacing[4],
      paddingBottom: spacing[2],
      gap: spacing[1],
    },
    attachmentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing[2],
      borderRadius: radius.md,
    },
    attachmentName: {
      fontSize: fontSize.sm,
      flex: 1,
    },
    removeButton: {
      padding: spacing[1],
    },
    inputHint: {
      fontSize: fontSize.xs,
      lineHeight: lineHeight.xs,
      textAlign: 'center',
      marginTop: spacing[2],
    },
    // Chat bubble attachment styles (separate from input attachments)
    messageAttachments: {
      marginBottom: spacing[2],
    },
    bubbleAttachmentsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing[1],
    },
    bubbleAttachmentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themeColors.background,
      borderRadius: radius.md,
      padding: spacing[2],
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    attachmentImage: {
      width: 150,
      height: 150,
      borderRadius: radius.md,
    },
    attachmentFile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
    },
    attachmentFileInfo: {
      flex: 1,
      minWidth: 0,
    },
    bubbleAttachmentName: {
      fontSize: fontSize.sm,
      flex: 1,
    },
    attachmentMeta: {
      fontSize: fontSize.xs,
      lineHeight: lineHeight.xs,
    },
  });
}
