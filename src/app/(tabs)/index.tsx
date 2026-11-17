import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { STALE_AFTER_MS } from '@/config/defaults';
import { rainSamplesSince } from '@/db/database';
import { cardinal16, dewPointC, feelsLikeC, lightCategory, uvCategory } from '@/lib/derived';
import { maxIntensityMmPerHour } from '@/lib/rain';
import { formatAgo, startOfTodayMs } from '@/lib/time';
import { formatLitres, formatLitresPerHour, formatNumber, formatTemp, formatWind } from '@/lib/units';
import { getStationService } from '@/station/stationService';
import { useSettingsStore } from '@/store/settingsStore';
import { useWeatherStore } from '@/store/weatherStore';
import { Button, Caption, Card, Chip, Skeleton, type ChipTone } from '@/ui/components/base';
import { MetricCard, WindCompass } from '@/ui/components/weather';
import { radius, space, useTheme } from '@/ui/theme';

const CONNECTION_LABEL = {
  idle: { label: 'Detenido', tone: 'neutral' as ChipTone },
  connecting: { label: 'Conectando', tone: 'neutral' as ChipTone },
  connected: { label: 'Conectado', tone: 'success' as ChipTone },
  reconnecting: { label: 'Reconectando', tone: 'warning' as ChipTone },
  offline: { label: 'Offline', tone: 'warning' as ChipTone },
  error: { label: 'Error', tone: 'danger' as ChipTone },
};

export default function DashboardScreen() {
  const t = useTheme();
  const { connection, latest, lastMessageAt, rainTodayMm, connectionDetail } = useWeatherStore();
  const { unitsTemp, unitsWind } = useSettingsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [intensity, setIntensity] = useState<number | null>(null);

  // Refresca el texto relativo ("hace 12 s") cada 15 s sin polling de red (PRD §7 Batería).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Intensidad máxima de hoy, recalculada al llegar cada lectura (RF-15).
  useEffect(() => {
    if (!latest) return;
    let cancelled = false;
    void rainSamplesSince(startOfTodayMs()).then(samples => {
      if (!cancelled) setIntensity(maxIntensityMmPerHour(samples));
    });
    return () => {
      cancelled = true;
    };
  }, [latest]);

  useEffect(() => {
    if (!refreshing) return;
    const id = setTimeout(() => setRefreshing(false), 800);
    return () => clearTimeout(id);
  }, [refreshing]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void getStationService().reconnect();
  }, []);

  const derived = useMemo(() => {
    if (!latest) return null;
    const { temperatureC, humidity, windAvgKmh, windDirDeg, uvi, lightLux, rainMm } = latest;
    return {
      feels: feelsLikeC(temperatureC, humidity, windAvgKmh),
      dew: temperatureC !== null && humidity !== null ? dewPointC(temperatureC, humidity) : null,
      uv: uvCategory(uvi),
      light: lightCategory(lightLux),
      cardinal: cardinal16(windDirDeg),
      rainMm,
    };
  }, [latest]);

  const stale = lastMessageAt !== null && now - lastMessageAt > STALE_AFTER_MS;
  const conn = CONNECTION_LABEL[connection];
  const hasData = latest !== null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">
              Estación Chuwi
            </Text>
            <Caption>
              {latest?.model ?? 'Vevor-7in1'} · {formatAgo(lastMessageAt, now)}
            </Caption>
          </View>
          <Chip label={conn.label} tone={conn.tone} />
        </View>

        {connection === 'error' || connection === 'reconnecting' ? (
          <Card style={{ backgroundColor: t.surfaceAlt }}>
            <Text style={{ color: t.text }}>
              {connectionDetail ?? 'Sin conexión con el broker. Reintentando…'}
            </Text>
            <View style={{ marginTop: space.sm }}>
              <Button label="Reconectar" onPress={() => void getStationService().reconnect()} variant="ghost" />
            </View>
          </Card>
        ) : null}

        {stale ? <Chip label="Sin datos recientes" tone="warning" /> : null}

        {!hasData ? (
          <View style={{ gap: space.md }}>
            <Card>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>
                Esperando datos de la estación
              </Text>
              <Caption>Comprueba la conexión y los ajustes del broker.</Caption>
            </Card>
            <Skeleton height={140} />
            <View style={styles.grid}>
              <View style={styles.col}><Skeleton /></View>
              <View style={styles.col}><Skeleton /></View>
            </View>
          </View>
        ) : (
          <>
            <Card style={styles.hero} label={`Temperatura ${formatTemp(latest.temperatureC, unitsTemp)}`}>
              <Text style={[styles.heroValue, { color: t.text }]}>
                {formatTemp(latest.temperatureC, unitsTemp)}
              </Text>
              <Caption>
                Sensación {formatTemp(derived?.feels ?? null, unitsTemp)}
                {latest.batteryOk === false ? ' · Batería baja' : ''}
              </Caption>
              {latest.micValid === false ? <Chip label="Lectura dudosa" tone="warning" /> : null}
            </Card>

            <View style={styles.grid}>
              <MetricCard label="Humedad" value={formatNumber(latest.humidity, 0, '%')} />
              <MetricCard
                label="Punto de rocío"
                value={formatTemp(derived?.dew ?? null, unitsTemp)}
              />
            </View>

            <View style={styles.grid}>
              <MetricCard
                label="Viento medio"
                value={formatWind(latest.windAvgKmh, unitsWind)}
                sub={`Máx. ${formatWind(latest.windMaxKmh, unitsWind)}`}
              >
                <WindCompass deg={latest.windDirDeg} size={56} />
              </MetricCard>
              <MetricCard
                label="Dirección"
                value={derived?.cardinal ?? '—'}
                sub={latest.windDirDeg !== null ? `${latest.windDirDeg}°` : undefined}
              />
            </View>

            <View style={styles.grid}>
              <MetricCard
                label="Lluvia hoy"
                value={formatLitres(rainTodayMm)}
                sub={`Acumulado ${formatLitres(latest.rainMm)}`}
              />
              <MetricCard
                label="Intensidad máx."
                value={formatLitresPerHour(intensity)}
                sub="Máxima de hoy"
              />
            </View>

            <View style={styles.grid}>
              <MetricCard
                label="UV"
                value={latest.uvi === null ? '—' : String(latest.uvi)}
                sub={derived?.uv ?? undefined}
              />
              <MetricCard
                label="Luminosidad"
                value={formatNumber(latest.lightLux, 0, 'lx')}
                sub={derived?.light ?? undefined}
              />
            </View>

            <Card style={{ marginTop: space.xs }} label="Estado de la batería">
              <Text style={{ color: t.text, fontSize: 15 }}>
                {latest.batteryOk === null
                  ? 'Batería: sin dato'
                  : latest.batteryOk
                    ? 'Batería OK'
                    : 'Batería baja'}
                {' · actualizado '}
                {latest.stationTime ?? formatAgo(latest.receivedAt, now)}
              </Text>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { fontSize: 22, fontWeight: '700' },
  hero: { alignItems: 'center', gap: space.sm, borderRadius: radius.card, paddingVertical: space.xl },
  heroValue: { fontSize: 56, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs },
  col: { flex: 1, margin: space.xs },
});
