import { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Plus, Folder, FolderPlus, ChevronRight, Trash2 } from 'lucide-react-native';
import { colors, spacing, radius, fontSize, lineHeight, fontWeight, getThemeColors, touchTarget } from '@/theme/tokens';
import { useColorScheme } from 'react-native';

const projects = [
  { id: '1', name: 'Web Development', updatedAt: Date.now() - 3600000, conversationCount: 5 },
  { id: '2', name: 'Learning Rust', updatedAt: Date.now() - 86400000, conversationCount: 3 },
];

export default function ProjectsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = getThemeColors(isDark);

  const [showCreate, setShowCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const handleCreate = () => {
    if (!newProjectName.trim()) return;
    console.log('Create project:', newProjectName);
    setNewProjectName('');
    setShowCreate(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
          Projects
        </Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreate(true)}
        >
          <FolderPlus size={20} color={colors.accent.primaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {projects.map((project) => (
          <TouchableOpacity
            key={project.id}
            style={[styles.projectItem, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
            onPress={() => {}}
          >
            <View style={styles.projectInfo}>
              <View style={[styles.projectIcon, { backgroundColor: `${colors.accent.primary}1A` }]}>
                <Folder size={22} color={colors.accent.primary} />
              </View>
              <View>
                <Text style={[styles.projectName, { color: themeColors.textPrimary }]}>
                  {project.name}
                </Text>
                <Text style={[styles.projectMeta, { color: themeColors.textTertiary }]}>
                  {project.conversationCount} conversations · Updated {new Date(project.updatedAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
            <View style={styles.projectActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => { e.stopPropagation(); }}
                accessibilityLabel="Open project"
              >
                <ChevronRight size={20} color={themeColors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => { e.stopPropagation(); }}
                accessibilityLabel="Delete project"
              >
                <Trash2 size={20} color={themeColors.textTertiary} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
        {projects.length === 0 && (
          <View style={styles.emptyState}>
            <Folder size={48} color={themeColors.textTertiary} style={styles.emptyIcon} />
            <Text style={[styles.emptyTitle, { color: themeColors.textSecondary }]}>
              No projects yet
            </Text>
            <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>
              Create a project to organize related chats
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Create project modal */}
      <Modal visible={showCreate} animationType="slide" transparent={true} onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay} onTouchStart={() => setShowCreate(false)}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surface }]} onTouchStart={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
              Create Project
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.textPrimary }]}
              value={newProjectName}
              onChangeText={setNewProjectName}
              placeholder="Project name"
              placeholderTextColor={themeColors.textTertiary}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButtonSecondary, { backgroundColor: themeColors.surfaceHover, borderColor: themeColors.border }]}
                onPress={() => setShowCreate(false)}
              >
                <Text style={[styles.modalButtonText, { color: themeColors.textPrimary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButtonPrimary, { backgroundColor: newProjectName.trim() ? colors.accent.primary : themeColors.border }]}
                onPress={handleCreate}
                disabled={!newProjectName.trim()}
              >
                <Text style={[styles.modalButtonText, { color: newProjectName.trim() ? colors.accent.primaryText : themeColors.textTertiary }]}>
                  Create
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[4],
    paddingBottom: spacing[2],
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    lineHeight: lineHeight['2xl'],
    fontWeight: fontWeight.semibold,
  },
  createButton: {
    width: touchTarget,
    height: touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.accent.primary,
    borderRadius: radius.md,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing[3],
  },
  projectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
    minWidth: 0,
  },
  projectIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing[1],
  },
  projectMeta: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  projectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  actionButton: {
    padding: spacing[2],
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[6],
  },
  emptyIcon: {
    marginBottom: spacing[4],
    opacity: 0.5,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.lg,
    padding: spacing[6],
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing[4],
  },
  modalInput: {
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: fontSize.base,
    marginBottom: spacing[4],
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[3],
  },
  modalButtonSecondary: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modalButtonPrimary: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
  },
  modalButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
});