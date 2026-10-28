import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { Slot } from 'expo-router';
import { useColorScheme } from 'react-native';
import { colors } from '@/theme/tokens';
import { database } from '@/utils/databaseWrapper';
import { createMobileKeyManager } from '@/utils/keyManager';
import { initializeCore } from '@prisma-ai/core/initialization';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? colors.dark : colors.light;
  const [coreInitialized, setCoreInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initializeApp() {
      try {
        const keyManager = createMobileKeyManager();
        await initializeCore(database, keyManager);

        if (!cancelled) {
          setCoreInitialized(true);
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
        if (!cancelled) {
          setInitError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    initializeApp();

    return () => {
      cancelled = true;
    };
  }, []);

  if (initError) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background, padding: 24 }]}>
        <Text style={{ color: themeColors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
          Initialization Failed
        </Text>
        <Text style={{ color: themeColors.textSecondary, fontSize: 14, textAlign: 'center' }}>
          {initError}
        </Text>
      </View>
    );
  }

  if (!coreInitialized) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
