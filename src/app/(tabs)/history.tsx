import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryLocalHistory } from '@/db/database';
import { BarChart, LineChart } from '@/ui/components/charts';
import { Button, Caption, Card, Chip, Skeleton, Title } from '@/ui/components/base';
import { computeStats, rainBars } from '@/history/stats';
import { RANGE_ERROR_MESSAGE, toHistoryRange, validateCustomRange, type RangeError } from '@/history/validation';
import { queryHistory, type InfluxConfig } from '@/influx/client';
import { loadSecrets } from '@/store/secrets';
import { useSettingsStore } from '@/store/settingsStore';
import type { HistoryPoint, HistorySource } from '@/types/weather';
import { formatDateTime, formatTimeOrDay } from '@/lib/time';

import { formatTemp, formatWind, formatLitres } from '@/lib/units';
import { radius, space, useTheme } from '@/ui/theme';

type Preset = 1 | 24 | 168 | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 1, label: '1 h' },
  { key: 24, label: '24 h' },
  { key: 168, label: '7 d' },
  { key: 'custom', label: 'Fechas' },
];

const DAY = 86_400_000;

export default function HistoryScreen() {
  const t = useTheme();
  const { unitsTemp, unitsWind, historySource, influx } = useSettingsStore();

  const [preset, setPreset] = useState<Preset>(24);
  const [startMs, setStartMs] = useState(() => Date.now() - DAY);
  const [endMs, setEndMs] = useState(() => Date.now());
  const [draftStart, setDraftStart] = useState(startMs);
  const [draftEnd, setDraftEnd] = useState(endMs);
  const [rangeError, setRangeError] = useState<RangeError | null>(null);
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<HistorySource>(historySource);
  const [picker, setPicker] = useState<{ field: 'start' | 'end'; mode: 'date' | 'time' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const range = toHistoryRange(preset, startMs, endMs);
    try {
      if (historySource === 'influx') {
        const secrets = await loadSecrets();
        if (!secrets.influxToken) throw new Error('Configura el token de InfluxDB en Ajustes.');
        const cfg: InfluxConfig = { ...influx, token: secrets.influxToken };
        setPoints(await queryHistory(cfg, range));
        setSource('influx');
      } else {
        setPoints(await queryLocalHistory(range));
        setSource('local');
      }
    } catch (err) {
      setPoints([]);
      setError(err instanceof Error ? err.message : 'Error al consultar el histórico');
    } finally {
      setLoading(false);
    }
  }, [preset, startMs, endMs, historySource, influx]);

  useEffect(() => {
    if (preset === 'custom') return;
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [preset, load]);

  const applyCustom = () => {
    const err = validateCustomRange(draftStart, draftEnd);
    setRangeError(err);
    if (err) return;
    setStartMs(draftStart);
    setEndMs(draftEnd);
    setPreset('custom');
    void load();
  };

  const openPicker = (field: 'start' | 'end', mode: 'date' | 'time') => {
    const value = field === 'start' ? draftStart : draftEnd;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: new Date(value),
        mode,
        is24Hour: true,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type !== 'set' || !date) return;
          setDraft(field, date.getTime(), mode, value);
        },
      });
    } else {
      setPicker({ field, mode });
    }
  };

  const setDraft = (field: 'start' | 'end', next: number, mode: 'date' | 'time', prev: number) => {
    // Mantener la parte no editada: al elegir fecha conservamos la hora, y viceversa.
    const base = new Date(prev);
    const picked = new Date(next);
    if (mode === 'date') {
      base.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    } else {
      base.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    }
    if (field === 'start') setDraftStart(base.getTime());
    else setDraftEnd(base.getTime());
    setRangeError(null);
  };

  const onIosChange = (event: DateTimePickerEvent, date?: Date) => {
    if (!picker) return;
    if (event.type === 'set' && date) {
      setDraft(picker.field, date.getTime(), picker.mode, picker.field === 'start' ? draftStart : draftEnd);
    }
    setPicker(null);
  };

  const stats = useMemo(() => computeStats(points), [points]);
  const bars = useMemo(() => rainBars(points), [points]);
  const times = useMemo(() => points.map(p => p.t), [points]);
  const rangeLabel =
    preset === 'custom' ? `${formatDateTime(startMs)} – ${formatDateTime(endMs)}` : null;
  const multiDay = preset === 'custom' ? endMs - startMs > DAY : preset >= 24;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>Histórico</Title>

        <View style={[styles.segment, { backgroundColor: t.surfaceAlt }]} accessibilityRole="tablist">
          {PRESETS.map(p => {
            const active = preset === p.key;
            return (
              <Pressable
                key={String(p.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setPreset(p.key)}
                style={[styles.segmentItem, active && { backgroundColor: t.surface }]}
              >
                <Text style={{ color: active ? t.primary : t.textMuted, fontWeight: '600' }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {preset === 'custom' ? (
          <Card style={{ gap: space.md }}>
            <Text style={{ color: t.text, fontWeight: '600' }}>Rango personalizado</Text>
            <View style={styles.row}>
              <DateField label="Desde" value={draftStart} onDate={() => openPicker('start', 'date')} onTime={() => openPicker('start', 'time')} />
              <DateField label="Hasta" value={draftEnd} onDate={() => openPicker('end', 'date')} onTime={() => openPicker('end', 'time')} />
            </View>
            {picker && Platform.OS === 'ios' ? (
              <DateTimePicker
                value={new Date(picker.field === 'start' ? draftStart : draftEnd)}
                mode={picker.mode}
                display="default"
                is24Hour
                onChange={onIosChange}
              />
            ) : null}
            {rangeError ? <Text style={{ color: t.danger }}>{RANGE_ERROR_MESSAGE[rangeError]}</Text> : null}
            <Button label="Aplicar rango" onPress={applyCustom} />
          </Card>
        ) : null}

        <View style={styles.headerRow}>
          <Caption>{rangeLabel ?? presetLabel(preset)}</Caption>
          <Chip label={source === 'influx' ? 'Fuente: InfluxDB' : 'Fuente: local'} />
        </View>

        {error ? (
          <Card style={{ backgroundColor: t.surfaceAlt }}>
            <Text style={{ color: t.danger }}>{error}</Text>
            <View style={{ marginTop: space.sm }}>
              <Button label="Reintentar" onPress={() => void load()} variant="ghost" />
            </View>
          </Card>
        ) : null}

        {loading ? (
          <Skeleton height={200} />
        ) : points.length === 0 ? (
          <Card>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>Aún no hay datos históricos</Text>
            <Caption>Cuando la estación publique lecturas aparecerán aquí.</Caption>
          </Card>
        ) : (
          <>
            <Card style={styles.stats}>
              <StatRow label="Temperatura máx." value={extreme(stats.tempMax, v => formatTemp(v, unitsTemp), multiDay)} />
              <StatRow label="Temperatura mín." value={extreme(stats.tempMin, v => formatTemp(v, unitsTemp), multiDay)} />
              <StatRow label="Viento máx." value={extreme(stats.windMax, v => formatWind(v, unitsWind), multiDay)} />
              <StatRow
                label="Inicio de lluvia"
                value={stats.rainStart === null ? 'Sin lluvia' : formatTimeOrDay(stats.rainStart)}
              />
              <StatRow label="Lluvia total" value={formatLitres(stats.rainTotalMm)} />
            </Card>

            <Card style={{ gap: space.sm }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>Temperatura y humedad</Text>
              <LineChart
                times={times}
                unit={unitsTemp === 'F' ? '°F' : '°C'}
                accessibilityLabel="Gráfica de temperatura y humedad"
                series={[
                  {
                    label: 'Temperatura',
                    color: t.primary,
                    values: points.map(p => (p.temperature === null ? null : unitsTemp === 'F' ? (p.temperature * 9) / 5 + 32 : p.temperature)),
                  },
                  { label: 'Humedad (%)', color: t.success, values: points.map(p => p.humidity) },
                ]}
              />
            </Card>

            <Card style={{ gap: space.sm }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>Viento</Text>
              <LineChart
                times={times}
                unit={unitsWind === 'ms' ? 'm/s' : unitsWind === 'mph' ? 'mph' : 'km/h'}
                accessibilityLabel="Gráfica de viento medio y máximo"
                series={[
                  { label: 'Medio', color: t.primary, values: points.map(p => p.windAvg) },
                  { label: 'Máximo', color: t.warning, values: points.map(p => p.windMax) },
                ]}
              />
            </Card>

            <Card style={{ gap: space.sm }}>
              <Text style={{ color: t.text, fontWeight: '600' }}>Lluvia por intervalo</Text>
              <BarChart
                times={bars.times}
                values={bars.values}
                color={t.primary}
                unit="mm"
                accessibilityLabel="Gráfica de lluvia por intervalo"
              />
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function presetLabel(p: Preset): string {
  if (p === 1) return 'Última hora';
  if (p === 24) return 'Últimas 24 horas';
  if (p === 168) return 'Últimos 7 días';
  return 'Rango personalizado';
}

/** Valor extremo con su hora. En rangos de varios días muestra también el día (PRD RF-21). */
function extreme(e: { value: number; t: number } | null, fmt: (v: number) => string, multiDay: boolean): string {
  if (!e) return '—';
  const when = multiDay ? formatDateTime(e.t) : formatTimeOnly(e.t);
  return `${fmt(e.value)} · ${when}`;
}

function formatTimeOnly(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function StatRow({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={styles.statRow}>
      <Caption>{label}</Caption>
      <Text style={{ color: t.text, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

function DateField({
  label,
  value,
  onDate,
  onTime,
}: {
  label: string;
  value: number;
  onDate: () => void;
  onTime: () => void;
}) {
  const t = useTheme();
  const d = new Date(value);
  const datePart = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const timePart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return (
    <View style={{ flex: 1, gap: space.xs }}>
      <Caption>{label}</Caption>
      <Pressable
        onPress={onDate}
        accessibilityRole="button"
        accessibilityLabel={`${label}: fecha ${datePart}`}
        style={[styles.field, { backgroundColor: t.surfaceAlt }]}
      >
        <Text style={{ color: t.text }}>{datePart}</Text>
      </Pressable>
      <Pressable
        onPress={onTime}
        accessibilityRole="button"
        accessibilityLabel={`${label}: hora ${timePart}`}
        style={[styles.field, { backgroundColor: t.surfaceAlt }]}
      >
        <Text style={{ color: t.text }}>{timePart}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  segment: { flexDirection: 'row', borderRadius: radius.chip, padding: space.xs },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.chip,
  },
  row: { flexDirection: 'row', gap: space.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stats: { gap: space.sm },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
  field: { borderRadius: radius.button, minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md },
});
