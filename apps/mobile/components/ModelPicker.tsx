import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  TextInput,
  useColorScheme,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  Sparkles,
  ChevronDown,
  Check,
  X,
  Search,
  Eye,
  Wrench,
  Paperclip,
  Cpu,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  getThemeColors,
} from '@/theme/tokens';
import { MODEL_CAPABILITIES, providerRegistry, isModelUsable } from '@prisma-ai/core/providers';
import type { ModelEntry } from '@prisma-ai/core/providers';

export interface ModelPickerProps {
  selectedModel: string;
  selectedProvider: string;
  onSelect: (modelId: string, providerId: string) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  isOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  nvidia: 'NVIDIA',
  openrouter: 'OpenRouter',
  omniroute: 'OmniRoute',
  groq: 'Groq',
  together: 'Together AI',
  fireworks: 'Fireworks AI',
};

/**
 * Filter models from MODEL_CAPABILITIES whose providers are registered and usable.
 * Checks that the provider is registered and the adapter recognizes that exact model name.
 */
export function getUsableModels(): ModelEntry[] {
  return MODEL_CAPABILITIES.filter((model) => isModelUsable(model.provider, model.id));
}

interface CapabilityBadgeProps {
  label: string;
  icon?: React.ReactNode;
  bg: string;
  textColor: string;
}

function CapabilityBadge({ label, icon, bg, textColor }: CapabilityBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon}
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export function ModelPicker({
  selectedModel,
  selectedProvider,
  onSelect,
  disabled = false,
  style,
  isOpen: propsIsOpen,
  onOpen,
  onClose,
}: ModelPickerProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = propsIsOpen !== undefined ? propsIsOpen : internalIsOpen;
  const [searchQuery, setSearchQuery] = useState('');

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = getThemeColors(isDark);

  // Re-compute usable models when modal opens or on render
  const usableModels = useMemo(() => getUsableModels(), []);

  // Find the currently selected model details from capability table
  const selectedEntry = useMemo(() => {
    return (
      usableModels.find(
        (m) => m.id === selectedModel && m.provider === selectedProvider
      ) ??
      MODEL_CAPABILITIES.find(
        (m) => m.id === selectedModel && m.provider === selectedProvider
      )
    );
  }, [usableModels, selectedModel, selectedProvider]);

  // Filter usable models by search query
  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return usableModels;

    return usableModels.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        m.provider.toLowerCase().includes(query)
    );
  }, [usableModels, searchQuery]);

  const handleOpen = useCallback(() => {
    if (!disabled) {
      setSearchQuery('');
      if (onOpen) {
        onOpen();
      } else {
        setInternalIsOpen(true);
      }
    }
  }, [disabled, onOpen]);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      setInternalIsOpen(false);
    }
  }, [onClose]);

  const handleSelect = useCallback(
    (model: ModelEntry) => {
      if (!isModelUsable(model.provider, model.id)) {
        return;
      }
      onSelect(model.id, model.provider);
      handleClose();
    },
    [onSelect, handleClose]
  );

  const displayModelName = selectedEntry?.name ?? selectedModel ?? 'Select Model';
  const displayProviderLabel =
    PROVIDER_LABELS[selectedProvider] ?? selectedProvider ?? 'Provider';

  return (
    <>
      {/* Trigger Button */}
      <TouchableOpacity
        style={[
          styles.trigger,
          {
            backgroundColor: themeColors.surface,
            borderColor: themeColors.border,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
        onPress={handleOpen}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Selected model: ${displayModelName}, provider: ${displayProviderLabel}`}
        accessibilityState={{ disabled, expanded: isOpen }}
      >
        <View style={styles.triggerLeft}>
          <View
            style={[
              styles.triggerIconContainer,
              { backgroundColor: `${themeColors.accent.primary}1A` },
            ]}
          >
            <Sparkles size={16} color={themeColors.accent.primary} />
          </View>
          <View style={styles.triggerTextContainer}>
            <Text
              style={[styles.triggerModelName, { color: themeColors.textPrimary }]}
              numberOfLines={1}
            >
              {displayModelName}
            </Text>
            <Text
              style={[styles.triggerProvider, { color: themeColors.textSecondary }]}
              numberOfLines={1}
            >
              {displayProviderLabel}
            </Text>
          </View>
        </View>

        <ChevronDown size={18} color={themeColors.textSecondary} />
      </TouchableOpacity>

      {/* Bottom Sheet Modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop tap to dismiss */}
          <Pressable
            style={styles.backdropPressable}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close model picker"
          />

          {/* Bottom Sheet Content */}
          <View
            style={[
              styles.sheetContainer,
              {
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
          >
            {/* Sheet Handle */}
            <View
              style={[styles.sheetHandle, { backgroundColor: themeColors.border }]}
            />

            {/* Header */}
            <View
              style={[
                styles.sheetHeader,
                { borderBottomColor: themeColors.border },
              ]}
            >
              <View style={styles.sheetHeaderLeft}>
                <Text
                  style={[styles.sheetTitle, { color: themeColors.textPrimary }]}
                >
                  Select Model
                </Text>
                <Text
                  style={[
                    styles.sheetSubtitle,
                    { color: themeColors.textSecondary },
                  ]}
                >
                  Usable models for active providers
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.closeButton,
                  { backgroundColor: `${themeColors.border}50` },
                ]}
                onPress={handleClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchSection}>
              <View
                style={[
                  styles.searchBar,
                  {
                    backgroundColor: themeColors.background,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <Search size={16} color={themeColors.textTertiary} />
                <TextInput
                  style={[
                    styles.searchInput,
                    { color: themeColors.textPrimary },
                  ]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search models..."
                  placeholderTextColor={themeColors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={14} color={themeColors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Model List */}
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredModels.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Cpu size={32} color={themeColors.textTertiary} />
                  <Text
                    style={[styles.emptyText, { color: themeColors.textTertiary }]}
                  >
                    No usable models found
                  </Text>
                </View>
              ) : (
                filteredModels.map((model) => {
                  const isSelected =
                    model.id === selectedModel &&
                    model.provider === selectedProvider;
                  const caps = model.capabilities;
                  const contextK = Math.round(model.contextWindow / 1000);

                  const usable = isModelUsable(model.provider, model.id);

                  return (
                    <TouchableOpacity
                      key={`${model.provider}-${model.id}`}
                      disabled={!usable}
                      style={[
                        styles.modelCard,
                        {
                          backgroundColor: isSelected
                            ? `${themeColors.accent.primary}12`
                            : themeColors.background,
                          borderColor: isSelected
                            ? themeColors.accent.primary
                            : themeColors.border,
                          opacity: usable ? 1 : 0.4,
                        },
                      ]}
                      onPress={() => handleSelect(model)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${model.name}, ${PROVIDER_LABELS[model.provider] ?? model.provider}${isSelected ? ', currently selected' : ''}`}
                    >
                      <View style={styles.modelCardHeader}>
                        <View style={styles.modelInfo}>
                          <Text
                            style={[
                              styles.modelName,
                              {
                                color: isSelected
                                  ? themeColors.accent.primary
                                  : themeColors.textPrimary,
                              },
                            ]}
                          >
                            {model.name}
                          </Text>
                          <Text
                            style={[
                              styles.modelMeta,
                              { color: themeColors.textSecondary },
                            ]}
                          >
                            {PROVIDER_LABELS[model.provider] ?? model.provider} •{' '}
                            {model.id}
                          </Text>
                        </View>

                        {isSelected && (
                          <View
                            style={[
                              styles.checkCircle,
                              {
                                backgroundColor: themeColors.accent.primary,
                              },
                            ]}
                          >
                            <Check size={14} color={themeColors.accent.primaryText} />
                          </View>
                        )}
                      </View>

                      {/* Capabilities Badges */}
                      <View style={styles.badgesRow}>
                        <CapabilityBadge
                          label={`${contextK}k ctx`}
                          bg={`${themeColors.border}80`}
                          textColor={themeColors.textSecondary}
                        />

                        {caps.vision && (
                          <CapabilityBadge
                            label="Vision"
                            icon={
                              <Eye
                                size={11}
                                color={themeColors.accent.primary}
                                style={styles.badgeIcon}
                              />
                            }
                            bg={`${themeColors.accent.primary}18`}
                            textColor={themeColors.accent.primary}
                          />
                        )}

                        {caps.toolCalling && (
                          <CapabilityBadge
                            label="Tools"
                            icon={
                              <Wrench
                                size={11}
                                color={themeColors.info}
                                style={styles.badgeIcon}
                              />
                            }
                            bg={`${themeColors.info}18`}
                            textColor={themeColors.info}
                          />
                        )}

                        {caps.fileInput && (
                          <CapabilityBadge
                            label="Files"
                            icon={
                              <Paperclip
                                size={11}
                                color={themeColors.warning}
                                style={styles.badgeIcon}
                              />
                            }
                            bg={`${themeColors.warning}18`}
                            textColor={themeColors.warning}
                          />
                        )}

                        {!caps.streaming ? (
                          <CapabilityBadge
                            label="Reasoning"
                            bg={`${themeColors.accent.primary}20`}
                            textColor={themeColors.textPrimary}
                          />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 44,
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
    marginRight: spacing[2],
  },
  triggerIconContainer: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerTextContainer: {
    flex: 1,
  },
  triggerModelName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  triggerProvider: {
    fontSize: fontSize.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  backdropPressable: {
    flex: 1,
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing[4],
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
  },
  sheetHeaderLeft: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  sheetSubtitle: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing[2],
  },
  searchSection: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    height: 38,
    gap: spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    paddingVertical: 0,
  },
  list: {
    paddingHorizontal: spacing[4],
  },
  listContent: {
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  emptyContainer: {
    paddingVertical: spacing[8],
    alignItems: 'center',
    gap: spacing[2],
  },
  emptyText: {
    fontSize: fontSize.sm,
  },
  modelCard: {
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing[2],
  },
  modelCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  modelInfo: {
    flex: 1,
    marginRight: spacing[2],
  },
  modelName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  modelMeta: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeIcon: {
    marginRight: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
  },
});

export default ModelPicker;
