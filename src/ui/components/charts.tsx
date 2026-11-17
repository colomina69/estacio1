import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { Caption } from '@/ui/components/base';
import { useTheme } from '@/ui/theme';

export interface Series {
  label: string;
  color: string;
  values: (number | null)[];
}

const W = 320;
const H = 160;
const PAD = 8;

/** Gráfica de líneas con SVG propio. Huecos (null) cortan la línea. */
export function LineChart({
  times,
  series,
  unit,
  accessibilityLabel,
}: {
  times: number[];
  series: Series[];
  unit: string;
  accessibilityLabel: string;
}) {
  const t = useTheme();
  const { paths, min, max } = useMemo(() => buildPaths(times, series), [times, series]);

  if (times.length < 2) {
    return <Caption>Sin suficientes datos para dibujar la gráfica.</Caption>;
  }

  return (
    <View accessibilityLabel={accessibilityLabel}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Rect x={0} y={0} width={W} height={H} fill={t.surfaceAlt} rx={12} />
        <Line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke={t.textMuted} strokeOpacity={0.25} />
        {paths.map((d, i) => (
          <Path key={series[i].label} d={d} stroke={series[i].color} strokeWidth={2} fill="none" />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Caption>
          {min !== null ? `${min.toFixed(1)} ${unit}` : '—'}
        </Caption>
        <Caption>{max !== null ? `${max.toFixed(1)} ${unit}` : '—'}</Caption>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        {series.map(s => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 3, backgroundColor: s.color, borderRadius: 2 }} />
            <Text style={{ color: t.text, fontSize: 12 }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Barras de lluvia por intervalo (PRD §10.3). */
export function BarChart({
  times,
  values,
  color,
  unit,
  accessibilityLabel,
}: {
  times: number[];
  values: number[];
  color: string;
  unit: string;
  accessibilityLabel: string;
}) {
  const t = useTheme();
  const max = Math.max(0, ...values);
  if (values.length === 0) return <Caption>Sin datos de lluvia en el periodo.</Caption>;
  const barW = W / values.length;
  return (
    <View accessibilityLabel={accessibilityLabel}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Rect x={0} y={0} width={W} height={H} fill={t.surfaceAlt} rx={12} />
        {values.map((v, i) => {
          const h = max > 0 ? (v / max) * (H - 2 * PAD) : 0;
          return (
            <Rect
              key={times[i]}
              x={i * barW + 1}
              y={H - PAD - h}
              width={Math.max(1, barW - 2)}
              height={h}
              fill={color}
            />
          );
        })}
      </Svg>
      <Caption>Máximo {max.toFixed(2)} {unit}</Caption>
    </View>
  );
}

function buildPaths(times: number[], series: Series[]) {
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const span = Math.max(1, t1 - t0);

  let min: number | null = null;
  let max: number | null = null;
  for (const s of series) {
    for (const v of s.values) {
      if (v === null) continue;
      if (min === null || v < min) min = v;
      if (max === null || v > max) max = v;
    }
  }
  const lo = min ?? 0;
  const hi = max ?? 1;
  const range = hi - lo || 1;

  const x = (ts: number) => PAD + ((ts - t0) / span) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / range) * (H - 2 * PAD);

  const paths = series.map(s => {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  });

  return { paths, min, max };
}
