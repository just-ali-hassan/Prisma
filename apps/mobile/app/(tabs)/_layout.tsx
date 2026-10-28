import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TabBarIcon } from '@/components/TabBarIcon';
import { MessageSquare, History, Folder, Settings, Bot } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import { useColorScheme } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import React from 'react';

import ChatScreen from './index';
import HistoryScreen from './history';
import ProjectsScreen from './projects';
import AgentsScreen from './agents';
import SettingsScreen from './settings';

const Tab = createBottomTabNavigator<{
  index: undefined;
  history: undefined;
  projects: undefined;
  agents: undefined;
  settings: undefined;
}>();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = isDark ? colors.dark : colors.light;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let IconComponent: typeof MessageSquare;
          switch (route.name) {
            case 'index':
              IconComponent = MessageSquare;
              break;
            case 'history':
              IconComponent = History;
              break;
            case 'projects':
              IconComponent = Folder;
              break;
            case 'agents':
              IconComponent = Bot;
              break;
            case 'settings':
              IconComponent = Settings;
              break;
            default:
              IconComponent = MessageSquare;
          }
          return <TabBarIcon Icon={IconComponent} focused={focused} color={color} size={24} />;
        },
        tabBarActiveTintColor: colors.accent.primary,
        tabBarInactiveTintColor: themeColors.textTertiary,
        tabBarStyle: styles.tabBar,
        headerShown: false,
      })}
    >
      <Tab.Screen name="index" options={{ title: 'Chat' }}>
        {() => <ChatScreen />}
      </Tab.Screen>
      <Tab.Screen name="history" options={{ title: 'History' }}>
        {() => <HistoryScreen />}
      </Tab.Screen>
      <Tab.Screen name="projects" options={{ title: 'Projects' }}>
        {() => <ProjectsScreen />}
      </Tab.Screen>
      <Tab.Screen name="agents" options={{ title: 'Agents' }}>
        {() => <AgentsScreen />}
      </Tab.Screen>
      <Tab.Screen name="settings" options={{ title: 'Settings' }}>
        {() => <SettingsScreen />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    height: 60,
    paddingBottom: 8,
  },
});