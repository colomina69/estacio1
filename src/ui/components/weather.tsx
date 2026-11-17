import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cardinal16 } from '@/lib/derived';
import { formatWind, formatLitres, formatLitresPerHour, formatNumber, formatTemp } from '@/lib/units';
import { Card, Caption } from '@/ui/components/base';
import { radius, space, useTheme } from '@/ui/theme';

/** Tarjeta de métrica con etiqueta accesible (PRD §10.5). */
export function MetricCard({
  label,
  value,
  sub,
  accessibilityLabel,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Card style={styles.metric} label={accessibilityLabel ?? `${label} ${value}`}>
      <Caption>{label}</Caption>
      <Text style={[styles.metricValue, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Caption>{sub}</Caption> : null}
      {children}
    </Card>
  );
}

/** Rosa de los vientos simple (PRD RF-16). Gira la aguja según `deg`. */
export function WindCompass({ deg, size = 72 }: { deg: number | null; size?: number }) {
  const t = useTheme();
  const rotation = deg ?? 0;
  const label =
    deg === null
      ? 'Dirección del viento sin datos'
      : `Viento del ${cardinal16(deg)}, ${Math.round(deg)} grados`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        styles.compass,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: t.textMuted,
        },
      ]}
    >
      <Text style={[styles.compassN, { color: t.danger }]}>N</Text>
      <View style={[styles.needleWrap, { transform: [{ rotate: `${rotation}deg` }] }]}>
        <View style={[styles.needle, { backgroundColor: t.primary }]} />
      </View>
    </View>
  );
}

/** Helpers de formato que consumen las tarjetas (unidades del usuario). */
export const fmt = {
  temp: formatTemp,
  wind: formatWind,
  litres: formatLitres,
  litresPerHour: formatLitresPerHour,
  num: formatNumber,
};

const styles = StyleSheet.create({
  metric: {
    flex: 1,
    minHeight: 110,
    gap: space.xs,
    borderRadius: radius.card,
    margin: space.xs,
  },
  metricValue: { fontSize: 24, fontWeight: '700' },
  compass: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  compassN: { position: 'absolute', top: 2, fontSize: 10, fontWeight: '700' },
  needleWrap: { position: 'absolute', width: 4, height: '100%', alignItems: 'center' },
  needle: { width: 3, height: '70%', borderRadius: 2, marginTop: '15%' },
});
