import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { Key, Save, Eye, EyeOff, CheckCircle, Moon, Sun, Monitor, Loader2 } from 'lucide-react-native';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, getThemeColors } from '@/theme/tokens';
import { useColorScheme } from 'react-native';
import { useTauriKeyManager } from '@/utils/secureStore';

const providers = [
  { id: 'openai', name: 'OpenAI', models: ['GPT-4o', 'GPT-4o mini', 'GPT-4.5', 'o1', 'o3', 'o4-mini'] },
  { id: 'anthropic', name: 'Anthropic', models: ['Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 5.5'] },
  { id: 'google', name: 'Google', models: ['Gemini 1.5 Flash', 'Gemini 1.5 Pro'] },
  { id: 'deepseek', name: 'DeepSeek', models: ['DeepSeek Chat', 'DeepSeek Reasoner'] },
  { id: 'xai', name: 'xAI', models: ['Grok 3', 'Grok 3 Mini'] },
  { id: 'nvidia', name: 'NVIDIA', models: ['Nemotron 3 Ultra'] },
  { id: 'openrouter', name: 'OpenRouter', models: ['Auto (multi-model)'] },
  { id: 'omniroute', name: 'OmniRoute', models: ['Auto (multi-model)'] },
  { id: 'groq', name: 'Groq', models: ['Llama 3.1 405B', 'Llama 3.1 70B', 'Llama 3.1 8B'] },
  { id: 'together', name: 'Together AI', models: ['Llama 3.1 405B', 'Mixtral 8x7B'] },
  { id: 'fireworks', name: 'Fireworks AI', models: ['Llama 3.1 70B', 'Llama 3.1 8B'] },
];

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? colors.dark : colors.light;

  const { setKey, getKey, listKeys } = useTauriKeyManager();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const savedKeys = await listKeys();
      for (const provider of savedKeys) {
        const key = await getKey(provider);
        if (key) {
          setKeys(prev => ({ ...prev, [provider]: key }));
        }
      }
    } catch (e) {
      console.error('Failed to load keys:', e);
    } finally {
      setLoading(false);
    }
  }, [getKey, listKeys]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const toggleVisibility = (providerId: string) => {
    setVisibility(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const handleSave = async (providerId: string) => {
    const key = keys[providerId];
    if (!key) return;

    try {
      await setKey(providerId, key);
      setSaved(providerId);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      console.error('Failed to save key:', err);
      Alert.alert('Error', 'Failed to save API key');
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
        Settings
      </Text>

      {/* API Keys Section */}
      <View style={[styles.section, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Key size={20} color={colors.accent.primary} />
          </View>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
            API Keys
          </Text>
        </View>
        <Text style={[styles.sectionDescription, { color: themeColors.textSecondary }]}>
          Add your API keys to enable providers. Keys are stored securely in your device's keychain.
        </Text>
        <View style={styles.providersList}>
          {providers.map((provider) => (
            <View
              key={provider.id}
              style={[styles.providerItem, { borderColor: themeColors.border }]}
            >
              <View style={styles.providerInfo}>
                <View style={[styles.providerBadge, { backgroundColor: `${colors.accent.primary}1A` }]}>
                  <Text style={styles.providerBadgeText}>{provider.id}</Text>
                </View>
                <View>
                  <Text style={[styles.providerName, { color: themeColors.textPrimary }]}>
                    {provider.name}
                  </Text>
                  <Text style={[styles.providerModels, { color: themeColors.textTertiary }]}>
                    Models: {provider.models.join(', ')}
                  </Text>
                </View>
              </View>
              <View style={styles.providerActions}>
                <View style={[styles.keyInputContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <TextInput
                    style={styles.keyInput}
                    value={keys[provider.id] || ''}
                    onChangeText={(text) => setKeys(prev => ({ ...prev, [provider.id]: text }))}
                    placeholder="Enter API key..."
                    placeholderTextColor={themeColors.textTertiary}
                    secureTextEntry={!visibility[provider.id]}
                  />
                  <TouchableOpacity
                    style={styles.visibilityButton}
                    onPress={() => setVisibility(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                  >
                    {visibility[provider.id] ? <EyeOff size={18} color={themeColors.textTertiary} /> : <Eye size={18} color={themeColors.textTertiary} />}
                  </TouchableOpacity>
                </View>
                {saved === provider.id ? (
                  <View style={styles.savedIndicator}>
                    <CheckCircle size={16} color={themeColors.success} />
                    <Text style={[styles.savedText, { color: themeColors.success }]}>Saved</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.saveButton, { backgroundColor: keys[provider.id] ? colors.accent.primary : themeColors.border }]}
                    onPress={() => handleSave(provider.id)}
                    disabled={!keys[provider.id] || loading}
                  >
                    {loading && provider.id === saved ? <Loader2 size={16} color={colors.accent.primaryText} /> : (
                      <Text style={[styles.saveButtonText, { color: keys[provider.id] ? colors.accent.primaryText : themeColors.textTertiary }]}>
                        Save
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Preferences Section */}
      <View style={[styles.section, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Monitor size={20} color={colors.accent.primary} />
          </View>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
            Preferences
          </Text>
        </View>
        <View style={[styles.settingItem, { borderTopColor: themeColors.border }]}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>
              Theme
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.textSecondary }]}>
              Choose color scheme
            </Text>
          </View>
          <View style={styles.themeSelector}>
            <TouchableOpacity
              style={[styles.themeOption, { borderColor: isDark ? colors.accent.primary : themeColors.border }]}
              onPress={() => {}}
            >
              <Moon size={20} color={isDark ? colors.accent.primary : themeColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.themeOption, { borderColor: !isDark ? colors.accent.primary : themeColors.border }]}
              onPress={() => {}}
            >
              <Sun size={20} color={!isDark ? colors.accent.primary : themeColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.themeOption, { borderColor: colorScheme === 'dark' ? colors.accent.primary : themeColors.border }]}
              onPress={() => {}}
            >
              <Monitor size={20} color={colorScheme === 'dark' ? colors.accent.primary : themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.settingItem, { borderTopColor: themeColors.border }]}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>
              Streaming
            </Text>
            <Text style={[styles.settingDescription, { color: themeColors.textSecondary }]}>
              Stream responses token by token
            </Text>
          </View>
          <Switch
            value={streamingEnabled}
            onValueChange={setStreamingEnabled}
            thumbColor={colors.accent.primary}
            trackColor={{ false: themeColors.border, true: `${colors.accent.primary}40` }}
          />
        </View>
      </View>

      {/* About Section */}
      <View style={[styles.section, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Key size={20} color={colors.accent.primary} />
          </View>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
            About
          </Text>
        </View>
        <Text style={[styles.aboutText, { color: themeColors.textSecondary }]}>
          Prisma v0.0.0 — Universal AI Client
        </Text>
        <Text style={[styles.aboutText, { color: themeColors.textTertiary }]}>
          Built with Expo, React Native, and TypeScript. Bring your own keys.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
    paddingBottom: spacing[8],
  },
  sectionTitle: {
    fontSize: fontSize['2xl'],
    lineHeight: lineHeight['2xl'],
    fontWeight: fontWeight.semibold,
    marginBottom: spacing[6],
  },
  section: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[4],
    marginBottom: spacing[6],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[2],
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: `${colors.accent.primary}1A`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionDescription: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginBottom: spacing[4],
  },
  providersList: {
    gap: spacing[3],
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.light.background,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
    minWidth: 0,
  },
  providerBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radius.sm,
  },
  providerBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.accent.primary,
  },
  providerName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing[1],
  },
  providerModels: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  providerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  keyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 200,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  keyInput: {
    flex: 1,
    padding: spacing[3],
    fontSize: fontSize.base,
    color: colors.light.textPrimary,
  },
  visibilityButton: {
    padding: spacing[2],
    justifyContent: 'center',
    alignItems: 'center',
  },
  savedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  savedText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  saveButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
  },
  saveButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing[1],
  },
  settingDescription: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  themeSelector: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  themeOption: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aboutText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginBottom: spacing[1],
  },
});