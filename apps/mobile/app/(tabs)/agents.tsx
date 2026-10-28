import { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { Bot, Zap, DollarSign, Settings, Play, Square } from 'lucide-react-native';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, getThemeColors } from '@/theme/tokens';
import { useColorScheme } from 'react-native';

export default function AgentsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? colors.dark : colors.light;

  const [agentMode, setAgentMode] = useState(false);
  const [autoApprove, setAutoApprove] = useState(true);
  const [maxSteps, setMaxSteps] = useState(10);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
        Agents
      </Text>

      {/* Agent Mode Toggle */}
      <View style={[styles.section, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Bot size={20} color={colors.accent.primary} />
          </View>
          <View style={styles.sectionText}>
            <Text style={[styles.sectionLabel, { color: themeColors.textPrimary }]}>
              Agent Mode
            </Text>
            <Text style={[styles.sectionDescription, { color: themeColors.textSecondary }]}>
              Enable autonomous tool use and multi-step reasoning
            </Text>
          </View>
          <Switch
            value={agentMode}
            onValueChange={setAgentMode}
            thumbColor={colors.accent.primary}
            trackColor={{ false: themeColors.border, true: `${colors.accent.primary}40` }}
          />
        </View>
        {agentMode && (
          <View style={styles.agentOptions}>
            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={[styles.sectionLabel, { color: themeColors.textPrimary }]}>
                  Auto-approve read-only
                </Text>
                <Text style={[styles.sectionDescription, { color: themeColors.textSecondary }]}>
                  Automatically execute read-only tools
                </Text>
              </View>
              <Switch
                value={autoApprove}
                onValueChange={setAutoApprove}
                thumbColor={colors.accent.primary}
                trackColor={{ false: themeColors.border, true: `${colors.accent.primary}40` }}
              />
            </View>
            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={[styles.sectionLabel, { color: themeColors.textPrimary }]}>
                  Max steps: {maxSteps}
                </Text>
                <Text style={[styles.sectionDescription, { color: themeColors.textSecondary }]}>
                  Limit tool calls per agent run
                </Text>
              </View>
              <View style={styles.sliderContainer}>
                <Text style={[styles.sliderValue, { color: themeColors.textPrimary }]}>{maxSteps}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Available Tools */}
      <View style={[styles.section, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Zap size={20} color={colors.accent.primary} />
          </View>
          <Text style={[styles.sectionLabel, { color: themeColors.textPrimary }]}>
            Available Tools
          </Text>
        </View>
        <Text style={[styles.sectionDescription, { color: themeColors.textSecondary }]}>
          Tools are provided by MCP connectors. Configure in Settings.
        </Text>
        <View style={styles.toolsList}>
          {[
            { name: 'File System', description: 'Read, write, and list files', category: 'Local' },
            { name: 'Web Search', description: 'Search the web for information', category: 'Remote' },
            { name: 'Code Execution', description: 'Run code in a sandbox', category: 'Local' },
            { name: 'GitHub', description: 'Interact with GitHub repositories', category: 'Remote' },
          ].map((tool) => (
            <View
              key={tool.name}
              style={[styles.toolItem, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
            >
              <View style={styles.toolInfo}>
                <View style={[styles.toolIcon, { backgroundColor: `${colors.accent.primary}1A` }]}>
                  <Zap size={20} color={colors.accent.primary} />
                </View>
                <View>
                  <Text style={[styles.toolName, { color: themeColors.textPrimary }]}>{tool.name}</Text>
                  <Text style={[styles.toolDescription, { color: themeColors.textSecondary }]}>{tool.description}</Text>
                </View>
              </View>
              <View style={[styles.toolCategory, { backgroundColor: `${colors.accent.primary}1A` }]}>
                <Text style={styles.toolCategoryText}>{tool.category}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Cost Estimation */}
      <View style={[styles.section, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <DollarSign size={20} color={colors.accent.primary} />
          </View>
          <Text style={[styles.sectionLabel, { color: themeColors.textPrimary }]}>
            Cost Estimation
          </Text>
        </View>
        <View style={styles.costGrid}>
          <View style={[styles.costCard, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
            <Text style={[styles.costLabel, { color: themeColors.textTertiary }]}>
              Per Run
            </Text>
            <Text style={[styles.costValue, { color: themeColors.textPrimary }]}>
              $0.00
            </Text>
          </View>
          <View style={[styles.costCard, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
            <Text style={[styles.costLabel, { color: themeColors.textTertiary }]}>
              Session Total
            </Text>
            <Text style={[styles.costValue, { color: themeColors.textPrimary }]}>
              $0.00
            </Text>
          </View>
        </View>
        <Text style={[styles.costDisclaimer, { color: themeColors.textTertiary }]}>
          Costs are estimates based on token usage and model pricing. Actual costs may vary.
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
  headerTitle: {
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
  sectionText: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing[1],
  },
  sectionDescription: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  agentOptions: {
    marginTop: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    gap: spacing[3],
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flex: 1,
  },
  sliderContainer: {
    width: '60%',
  },
  sliderValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  toolsList: {
    gap: spacing[2],
    marginTop: spacing[3],
  },
  toolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  toolInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
    minWidth: 0,
  },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing[1],
  },
  toolDescription: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  toolCategory: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radius.sm,
  },
  toolCategoryText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.accent.primary,
  },
  costGrid: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[3],
  },
  costCard: {
    flex: 1,
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  costLabel: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginBottom: spacing[1],
  },
  costValue: {
    fontSize: fontSize['2xl'],
    lineHeight: lineHeight['2xl'],
    fontWeight: fontWeight.semibold,
  },
  costDisclaimer: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    textAlign: 'center',
    marginTop: spacing[3],
  },
});