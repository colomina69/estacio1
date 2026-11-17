import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettingsStore } from '@/store/settingsStore';

/** Tokens de color (PRD §10.2). */
export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
  isDark: boolean;
}

export const LIGHT: Palette = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  text: '#0F172A',
  textMuted: '#64748B',
  primary: '#0EA5E9',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  isDark: false,
};

export const DARK: Palette = {
  bg: '#0B1220',
  surface: '#111A2B',
  surfaceAlt: '#16213A',
  text: '#E2E8F0',
  textMuted: '#94A3B8',
  primary: '#38BDF8',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  isDark: true,
};

/** Escala de espaciado (PRD §10.2). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Radios (PRD §10.2): tarjetas 20, chips 999, botones 14. */
export const radius = { card: 20, chip: 999, button: 14 } as const;

/** Tamaño táctil mínimo (PRD §10.5). */
export const MIN_TOUCH = 44;

const ThemeContext = createContext<Palette>(LIGHT);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = useSettingsStore(s => s.theme);
  const palette = useMemo(() => {
    const dark = theme === 'dark' || (theme === 'system' && scheme === 'dark');
    return dark ? DARK : LIGHT;
  }, [theme, scheme]);
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Palette {
  return useContext(ThemeContext);
}
