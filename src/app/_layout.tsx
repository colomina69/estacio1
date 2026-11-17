import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setupNotifications } from '@/alerts/notifications';
import { getStationService } from '@/station/stationService';
import { ThemeProvider, useTheme } from '@/ui/theme';

function RootContent() {
  const palette = useTheme();

  useEffect(() => {
    void setupNotifications();
    const service = getStationService();
    void service.start();
    return () => service.stop();
  }, []);

  return (
    <>
      <StatusBar style={palette.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
