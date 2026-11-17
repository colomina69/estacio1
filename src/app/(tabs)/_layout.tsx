import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { useTheme } from '@/ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  const palette = useTheme();

  const icon = (name: IconName) =>
    function TabIcon({ focused }: { focused: boolean }) {
      return <Ionicons name={name} size={24} color={focused ? palette.primary : palette.textMuted} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.surfaceAlt },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Estado', tabBarIcon: icon('partly-sunny-outline') }} />
      <Tabs.Screen name="history" options={{ title: 'Histórico', tabBarIcon: icon('stats-chart-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: icon('settings-outline') }} />
    </Tabs>
  );
}
