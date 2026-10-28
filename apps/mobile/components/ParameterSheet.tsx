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
  type LayoutChangeEvent,
} from 'react-native';
import {
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Minus,
  Plus,
  AlertCircle,
  FileText,
  Sparkles,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  getThemeColors,
} from '@/theme/tokens';
import { useChatStore } from '@/stores/chatStore';
import { MODEL_CAPABILITIES } from '@prisma-ai/core/providers';

export interface ParameterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
  currentModel?: string;
  currentProvider?: string;
  setTemperature?: (val: number) => void;
  setMaxTokens?: (val: number) => void;
  setTopP?: (val: number) => void;
  setFrequencyPenalty?: (val: number) => void;
  setPresencePenalty?: (val: number) => void;
  setSystemPrompt?: (val: string) => void;
}

/**
 * Check if the model is an OpenAI reasoning model (e.g. o1, o3, o4-mini).
 * Reasoning models reject temperature, top_p, frequency_penalty, and presence_penalty.
 */
export function isReasoningModel(modelId: string): boolean {
  return /^(o1|o3|o4)/i.test(modelId);
}

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  presets?: { label: string; value: number }[];
  onChange: (val: number) => void;
  themeColors: ReturnType<typeof getThemeColors>;
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  decimals = 1,
  description,
  disabled = false,
  disabledReason,
  presets,
  onChange,
  themeColors,
}: SliderControlProps) {
  const [trackWidth, setTrackWidth] = useState(0);

  const percentage = useMemo(() => {
    if (max <= min) return 0;
    const clamped = Math.min(Math.max(value, min), max);
    return ((clamped - min) / (max - min)) * 100;
  }, [value, min, max]);

  const handleTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const handleTrackPress = (locationX: number) => {
    if (disabled || trackWidth <= 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
    const rawValue = min + ratio * (max - min);
    const stepped = Math.round(rawValue / step) * step;
    const clamped = Math.max(min, Math.min(max, Number(stepped.toFixed(decimals))));
    onChange(clamped);
  };

  const handleDecrement = () => {
    if (disabled) return;
    const next = Math.max(min, Number((value - step).toFixed(decimals)));
    onChange(next);
  };

  const handleIncrement = () => {
    if (disabled) return;
    const next = Math.min(max, Number((value + step).toFixed(decimals)));
    onChange(next);
  };

  const displayValue = decimals > 0 ? value.toFixed(decimals) : value.toLocaleString();

  return (
    <View style={[styles.controlCard, { opacity: disabled ? 0.6 : 1 }]}>
      <View style={styles.controlHeader}>
        <View style={styles.controlLabelContainer}>
          <Text style={[styles.controlLabel, { color: themeColors.textPrimary }]}>
            {label}
          </Text>
          {disabled && disabledReason && (
            <View
              style={[
                styles.disabledBadge,
                { backgroundColor: `${themeColors.warning}20` },
              ]}
            >
              <AlertCircle size={11} color={themeColors.warning} />
              <Text
                style={[styles.disabledBadgeText, { color: themeColors.warning }]}
              >
                {disabledReason}
              </Text>
            </View>
          )}
        </View>

        <Text
          style={[
            styles.controlValue,
            { color: disabled ? themeColors.textTertiary : themeColors.accent.primary },
          ]}
        >
          {displayValue}
        </Text>
      </View>

      {/* Stepper + Track Bar */}
      <View style={styles.sliderRow}>
        <TouchableOpacity
          style={[
            styles.stepperButton,
            {
              backgroundColor: themeColors.background,
              borderColor: themeColors.border,
            },
          ]}
          onPress={handleDecrement}
          disabled={disabled || value <= min}
          activeOpacity={0.6}
          accessibilityLabel={`Decrease ${label}`}
          accessibilityRole="button"
        >
          <Minus size={14} color={disabled || value <= min ? themeColors.textTertiary : themeColors.textPrimary} />
        </TouchableOpacity>

        {/* Interactive Track */}
        <Pressable
          style={styles.trackContainer}
          onLayout={handleTrackLayout}
          onPress={(e) => handleTrackPress(e.nativeEvent.locationX)}
          disabled={disabled}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: value }}
        >
          <View
            style={[
              styles.trackBackground,
              { backgroundColor: themeColors.border },
            ]}
          >
            <View
              style={[
                styles.trackFill,
                {
                  width: `${percentage}%`,
                  backgroundColor: disabled
                    ? themeColors.textTertiary
                    : themeColors.accent.primary,
                },
              ]}
            />
          </View>
          <View
            style={[
              styles.trackThumb,
              {
                left: `${percentage}%`,
                backgroundColor: disabled
                  ? themeColors.textTertiary
                  : themeColors.accent.primary,
                borderColor: themeColors.surface,
              },
            ]}
          />
        </Pressable>

        <TouchableOpacity
          style={[
            styles.stepperButton,
            {
              backgroundColor: themeColors.background,
              borderColor: themeColors.border,
            },
          ]}
          onPress={handleIncrement}
          disabled={disabled || value >= max}
          activeOpacity={0.6}
          accessibilityLabel={`Increase ${label}`}
          accessibilityRole="button"
        >
          <Plus size={14} color={disabled || value >= max ? themeColors.textTertiary : themeColors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Preset Chips */}
      {presets && presets.length > 0 && !disabled && (
        <View style={styles.presetsRow}>
          {presets.map((preset) => {
            const isSelected = Math.abs(value - preset.value) < step / 2;
            return (
              <TouchableOpacity
                key={preset.label}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: isSelected
                      ? `${themeColors.accent.primary}20`
                      : themeColors.background,
                    borderColor: isSelected
                      ? themeColors.accent.primary
                      : themeColors.border,
                  },
                ]}
                onPress={() => onChange(preset.value)}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    {
                      color: isSelected
                        ? themeColors.accent.primary
                        : themeColors.textSecondary,
                      fontWeight: isSelected
                        ? fontWeight.semibold
                        : fontWeight.normal,
                    },
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {description ? (
        <Text
          style={[styles.controlDescription, { color: themeColors.textTertiary }]}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}

export function ParameterSheet(props: ParameterSheetProps) {
  const { isOpen, onClose } = props;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = getThemeColors(isDark);

  const store = useChatStore();

  const temperature = props.temperature ?? store.temperature;
  const maxTokens = props.maxTokens ?? store.maxTokens;
  const topP = props.topP ?? store.topP;
  const frequencyPenalty = props.frequencyPenalty ?? store.frequencyPenalty;
  const presencePenalty = props.presencePenalty ?? store.presencePenalty;
  const systemPrompt = props.systemPrompt ?? store.systemPrompt;
  const currentModel = props.currentModel ?? store.currentModel;
  const currentProvider = props.currentProvider ?? store.currentProvider;

  const setTemperature = props.setTemperature ?? store.setTemperature;
  const setMaxTokens = props.setMaxTokens ?? store.setMaxTokens;
  const setTopP = props.setTopP ?? store.setTopP;
  const setFrequencyPenalty = props.setFrequencyPenalty ?? store.setFrequencyPenalty;
  const setPresencePenalty = props.setPresencePenalty ?? store.setPresencePenalty;
  const setSystemPrompt = props.setSystemPrompt ?? store.setSystemPrompt;

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  // Selected model capabilities & context window constraint
  const selectedEntry = useMemo(() => {
    return MODEL_CAPABILITIES.find(
      (m) => m.id === currentModel && m.provider === currentProvider
    );
  }, [currentModel, currentProvider]);

  const contextWindow = selectedEntry?.contextWindow ?? 4096;
  const isReasoning = isReasoningModel(currentModel) || Boolean(selectedEntry?.capabilities?.reasoning);
  const supportsPenalties = !isReasoning && currentProvider !== 'anthropic' && currentProvider !== 'google';
  const penaltyDisabledReason = isReasoning
    ? 'Locked for reasoning models'
    : !supportsPenalties
    ? `Not supported by ${currentProvider}`
    : undefined;

  // Max Tokens presets based on context window
  const maxTokensPresets = useMemo(() => {
    const list: { label: string; value: number }[] = [
      { label: '1k', value: 1024 },
      { label: '4k', value: 4096 },
    ];
    if (contextWindow >= 16384) {
      list.push({ label: '16k', value: 16384 });
    }
    if (contextWindow >= 65536) {
      list.push({ label: '64k', value: 65536 });
    }
    list.push({
      label: `Max (${Math.round(contextWindow / 1000)}k)`,
      value: contextWindow,
    });
    return list;
  }, [contextWindow]);

  const handleResetDefaults = useCallback(() => {
    setTemperature(0.7);
    setMaxTokens(Math.min(4096, contextWindow));
    setTopP(1.0);
    setFrequencyPenalty(0);
    setPresencePenalty(0);
    setSystemPrompt('');
  }, [contextWindow, setTemperature, setMaxTokens, setTopP, setFrequencyPenalty, setPresencePenalty, setSystemPrompt]);

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={styles.backdropPressable}
          onPress={onClose}
          accessibilityLabel="Close parameter sheet"
          accessibilityRole="button"
        />

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
            },
          ]}
        >
          {/* Top Sheet Handle */}
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
              <View style={styles.sheetTitleRow}>
                <SlidersHorizontal size={20} color={themeColors.accent.primary} />
                <Text
                  style={[styles.sheetTitle, { color: themeColors.textPrimary }]}
                >
                  Parameters
                </Text>
              </View>
              <Text
                style={[
                  styles.sheetSubtitle,
                  { color: themeColors.textSecondary },
                ]}
              >
                {selectedEntry?.name ?? currentModel} ({currentProvider}) •{' '}
                {contextWindow.toLocaleString()} ctx
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.closeButton,
                { backgroundColor: `${themeColors.border}50` },
              ]}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Content Scroll View */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Reasoning Model Warning */}
            {isReasoning && (
              <View
                style={[
                  styles.infoBanner,
                  {
                    backgroundColor: `${themeColors.info}15`,
                    borderColor: themeColors.info,
                  },
                ]}
              >
                <Sparkles size={16} color={themeColors.info} />
                <Text
                  style={[styles.infoBannerText, { color: themeColors.textPrimary }]}
                >
                  Reasoning model ({selectedEntry?.name ?? currentModel}) manages its own sampling and temperature.
                </Text>
              </View>
            )}

            {/* Basic Parameters */}
            <View style={styles.section}>
              {/* Temperature */}
              <SliderControl
                label="Temperature"
                value={temperature}
                min={0}
                max={2.0}
                step={0.1}
                decimals={1}
                description="Controls randomness. Lower = focused & deterministic, higher = creative."
                disabled={isReasoning}
                disabledReason="Locked for reasoning models"
                presets={[
                  { label: '0.2 Focused', value: 0.2 },
                  { label: '0.7 Balanced', value: 0.7 },
                  { label: '1.2 Creative', value: 1.2 },
                ]}
                onChange={setTemperature}
                themeColors={themeColors}
              />

              {/* Max Tokens */}
              <SliderControl
                label="Max Tokens"
                value={maxTokens}
                min={64}
                max={contextWindow}
                step={128}
                decimals={0}
                description={`Upper limit on completion tokens. Constrained to model max: ${contextWindow.toLocaleString()}`}
                presets={maxTokensPresets}
                onChange={setMaxTokens}
                themeColors={themeColors}
              />

              {/* Top-P */}
              <SliderControl
                label="Top-P"
                value={topP}
                min={0.05}
                max={1.0}
                step={0.05}
                decimals={2}
                description="Nucleus sampling. Alternative to temperature for controlling diversity."
                disabled={isReasoning}
                disabledReason="Locked for reasoning models"
                presets={[
                  { label: '0.5 Focused', value: 0.5 },
                  { label: '0.9 Standard', value: 0.9 },
                  { label: '1.0 Full', value: 1.0 },
                ]}
                onChange={setTopP}
                themeColors={themeColors}
              />
            </View>

            {/* Advanced Section (Collapsible) */}
            <View
              style={[
                styles.accordionCard,
                {
                  backgroundColor: themeColors.background,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => setShowAdvanced(!showAdvanced)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Toggle advanced parameters"
                accessibilityState={{ expanded: showAdvanced }}
              >
                <View style={styles.accordionTitleRow}>
                  <Text
                    style={[
                      styles.accordionTitle,
                      { color: themeColors.textPrimary },
                    ]}
                  >
                    Advanced Parameters
                  </Text>
                  {!supportsPenalties && (
                    <Text
                      style={[
                        styles.accordionTag,
                        { color: themeColors.textTertiary },
                      ]}
                    >
                      (unsupported)
                    </Text>
                  )}
                </View>
                {showAdvanced ? (
                  <ChevronUp size={18} color={themeColors.textSecondary} />
                ) : (
                  <ChevronDown size={18} color={themeColors.textSecondary} />
                )}
              </TouchableOpacity>

              {showAdvanced && (
                <View style={styles.accordionContent}>
                  {/* Frequency Penalty */}
                  <SliderControl
                    label="Frequency Penalty"
                    value={frequencyPenalty}
                    min={-2.0}
                    max={2.0}
                    step={0.1}
                    decimals={1}
                    description="Penalizes repeated words based on frequency in generated text."
                    disabled={!supportsPenalties}
                    disabledReason={penaltyDisabledReason}
                    presets={[
                      { label: '-1.0 Low', value: -1.0 },
                      { label: '0.0 None', value: 0.0 },
                      { label: '1.0 High', value: 1.0 },
                    ]}
                    onChange={setFrequencyPenalty}
                    themeColors={themeColors}
                  />

                  {/* Presence Penalty */}
                  <SliderControl
                    label="Presence Penalty"
                    value={presencePenalty}
                    min={-2.0}
                    max={2.0}
                    step={0.1}
                    decimals={1}
                    description="Encourages introducing new topics by penalizing words that already appeared."
                    disabled={!supportsPenalties}
                    disabledReason={penaltyDisabledReason}
                    presets={[
                      { label: '-1.0 Low', value: -1.0 },
                      { label: '0.0 None', value: 0.0 },
                      { label: '1.0 High', value: 1.0 },
                    ]}
                    onChange={setPresencePenalty}
                    themeColors={themeColors}
                  />
                </View>
              )}
            </View>

            {/* System Prompt Section (Collapsible) */}
            <View
              style={[
                styles.accordionCard,
                {
                  backgroundColor: themeColors.background,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => setShowSystemPrompt(!showSystemPrompt)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Toggle system prompt"
                accessibilityState={{ expanded: showSystemPrompt }}
              >
                <View style={styles.accordionTitleRow}>
                  <FileText size={16} color={themeColors.accent.primary} />
                  <Text
                    style={[
                      styles.accordionTitle,
                      { color: themeColors.textPrimary },
                    ]}
                  >
                    System Prompt
                  </Text>
                  {systemPrompt.trim().length > 0 && (
                    <View
                      style={[
                        styles.badgePill,
                        { backgroundColor: `${themeColors.success}20` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgePillText,
                          { color: themeColors.success },
                        ]}
                      >
                        Active
                      </Text>
                    </View>
                  )}
                </View>
                {showSystemPrompt ? (
                  <ChevronUp size={18} color={themeColors.textSecondary} />
                ) : (
                  <ChevronDown size={18} color={themeColors.textSecondary} />
                )}
              </TouchableOpacity>

              {showSystemPrompt && (
                <View style={styles.accordionContent}>
                  <TextInput
                    style={[
                      styles.systemPromptInput,
                      {
                        backgroundColor: themeColors.surface,
                        borderColor: themeColors.border,
                        color: themeColors.textPrimary,
                      },
                    ]}
                    value={systemPrompt}
                    onChangeText={setSystemPrompt}
                    placeholder="Enter instructions to guide the model's persona, tone, or constraints..."
                    placeholderTextColor={themeColors.textTertiary}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  <View style={styles.systemPromptFooter}>
                    <Text
                      style={[
                        styles.controlDescription,
                        { color: themeColors.textTertiary },
                      ]}
                    >
                      Prepended to every request in this conversation.
                    </Text>
                    {systemPrompt.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setSystemPrompt('')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text
                          style={[
                            styles.clearText,
                            { color: themeColors.error },
                          ]}
                        >
                          Clear
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[
                  styles.resetButton,
                  {
                    backgroundColor: themeColors.background,
                    borderColor: themeColors.border,
                  },
                ]}
                onPress={handleResetDefaults}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Reset parameters to defaults"
              >
                <RotateCcw size={15} color={themeColors.textSecondary} />
                <Text
                  style={[
                    styles.resetButtonText,
                    { color: themeColors.textSecondary },
                  ]}
                >
                  Reset Defaults
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.doneButton,
                  { backgroundColor: themeColors.accent.primary },
                ]}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text
                  style={[
                    styles.doneButtonText,
                    { color: themeColors.accent.primaryText },
                  ]}
                >
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: '85%',
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
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
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
  scrollArea: {
    paddingHorizontal: spacing[4],
  },
  scrollContent: {
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  infoBannerText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  section: {
    gap: spacing[3],
  },
  controlCard: {
    gap: spacing[2],
  },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
  },
  controlLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  controlValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  disabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  disabledBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackContainer: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBackground: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 3,
  },
  trackThumb: {
    position: 'absolute',
    top: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  presetChip: {
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 11,
  },
  controlDescription: {
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  accordionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[3],
  },
  accordionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  accordionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  accordionTag: {
    fontSize: fontSize.xs,
  },
  accordionContent: {
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[3],
  },
  badgePill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  systemPromptInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    fontSize: fontSize.sm,
    minHeight: 90,
  },
  systemPromptFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingTop: spacing[2],
    paddingBottom: spacing[4],
  },
  resetButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  resetButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  doneButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: radius.md,
  },
  doneButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});

export default ParameterSheet;
