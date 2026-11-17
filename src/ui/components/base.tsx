import { Pressable, StyleSheet, Text, View, type AccessibilityRole, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { MIN_TOUCH, radius, space, useTheme } from '@/ui/theme';

export function Card({
  children,
  style,
  label,
}: {
  children: ReactNode;
  style?: ViewStyle;
  label?: string;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityLabel={label}
      style={[styles.card, { backgroundColor: t.surface, borderColor: t.surfaceAlt }, style]}
    >
      {children}
    </View>
  );
}

export function Title({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const t = useTheme();
  return (
    <Text style={[styles.h2, { color: muted ? t.textMuted : t.text }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.caption, { color: t.textMuted }]}>{children}</Text>;
}

export type ChipTone = 'success' | 'warning' | 'danger' | 'neutral';

/** Chip de estado: siempre incluye texto (no depende solo del color, PRD §10.5). */
export function Chip({ label, tone = 'neutral' }: { label: string; tone?: ChipTone }) {
  const t = useTheme();
  const color =
    tone === 'success' ? t.success : tone === 'warning' ? t.warning : tone === 'danger' ? t.danger : t.textMuted;
  return (
    <View
      accessibilityLabel={`Estado: ${label}`}
      style={[styles.chip, { borderColor: color, backgroundColor: t.surfaceAlt }]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.chipText, { color: t.text }]}>{label}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  accessibilityRole = 'button',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  accessibilityRole?: AccessibilityRole;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : t.surfaceAlt;
  const fg = variant === 'ghost' ? t.text : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Placeholder de carga con la forma de una tarjeta (PRD §10.4). */
export function Skeleton({ height = 96 }: { height?: number }) {
  const t = useTheme();
  return <View style={[styles.skeleton, { height, backgroundColor: t.surfaceAlt }]} />;
}

export const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  h2: { fontSize: 20, fontWeight: '700' },
  caption: { fontSize: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.chip,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    gap: space.sm,
    minHeight: 32,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: {
    borderRadius: radius.button,
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  skeleton: { borderRadius: radius.card },
});
