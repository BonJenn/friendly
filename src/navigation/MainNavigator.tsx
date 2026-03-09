import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { ChatScreen } from '@/screens/chat/ChatScreen';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';
import { colors, spacing } from '@/config/theme';
import type { MainTabParamList } from '@/types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '⌂',
    Chat: '◯',
    Settings: '⚙',
  };

  return (
    <View style={styles.tabIcon}>
      <Text
        style={[
          styles.tabIconText,
          focused && styles.tabIconFocused,
        ]}
      >
        {icons[name] ?? '·'}
      </Text>
    </View>
  );
}

export function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bgCard,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 85,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconText: {
    fontSize: 24,
    color: colors.textMuted,
  },
  tabIconFocused: {
    color: colors.primary,
  },
});
