import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEFAULT_SETTINGS } from '@/config/defaults';
import { clearHistory, purgeOlderThan } from '@/db/database';
import { requestNotificationPermission } from '@/alerts/notifications';
import { testInfluxConnection, type InfluxConfig } from '@/influx/client';
import { getStationService } from '@/station/stationService';
import { clearSecrets, loadSecrets, saveSecrets } from '@/store/secrets';
import { useSettingsStore } from '@/store/settingsStore';
import { useWeatherStore } from '@/store/weatherStore';
import { Button, Caption, Card, Chip, Title } from '@/ui/components/base';
import { radius, space, useTheme } from '@/ui/theme';
import type { Settings, TransportKind } from '@/types/weather';

export default function SettingsScreen() {
  const t = useTheme();
  const settings = useSettingsStore();
  const diagnostics = useWeatherStore(s => s.diagnostics);
  const logs = useWeatherStore(s => s.logs);
  const connection = useWeatherStore(s => s.connection);

  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void loadSecrets().then(s => {
      setHasPassword(s.mqttPassword.length > 0);
      setHasToken(s.influxToken.length > 0);
    });
  }, []);

  const setField = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    settings.update({ [key]: value } as Partial<Settings>);

  const saveConnection = async () => {
    const patch: { mqttPassword?: string; influxToken?: string } = {};
    if (password) patch.mqttPassword = password;
    if (token) patch.influxToken = token;
    await saveSecrets(patch);
    setPassword('');
    setToken('');
    setHasPassword(true);
    setHasToken(true);
    setStatus('Ajustes guardados. Reconectando…');
    void getStationService().reconnect();
  };

  const testInflux = async () => {
    try {
      const stored = await loadSecrets();
      const tokenToUse = token || stored.influxToken;
      if (!tokenToUse) throw new Error('Introduce el token de InfluxDB.');
      const cfg: InfluxConfig = { ...settings.influx, token: tokenToUse };
      await testInfluxConnection(cfg);
      setStatus('InfluxDB responde correctamente.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Error al probar InfluxDB');
    }
  };

  const toggleAlerts = async (key: keyof Settings['thresholds'], on: boolean) => {
    if (on && (key === 'batteryLow' || key === 'connectionLost' || key === 'windMaxKmh')) {
      await requestNotificationPermission();
    }
    settings.update({ thresholds: { [key]: on ? DEFAULT_SETTINGS.thresholds[key] : null } });
  };

  const resetAll = () => {
    Alert.alert('Restablecer ajustes', 'Se restablecen los ajustes y se borran las credenciales guardadas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restablecer',
        style: 'destructive',
        onPress: async () => {
          settings.reset();
          await clearSecrets();
          setHasPassword(false);
          setHasToken(false);
          setStatus('Ajustes restablecidos.');
        },
      },
    ]);
  };

  const wipeHistory = () => {
    Alert.alert('Borrar histórico', 'Se eliminan las lecturas y alertas guardadas en el dispositivo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          setStatus('Histórico local borrado.');
        },
      },
    ]);
  };

  const applyRetention = async () => {
    const removed = await purgeOlderThan(settings.retentionDays);
    setStatus(`Purgadas ${removed} lecturas antiguas.`);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>Ajustes</Title>
        {status ? <Chip label={status} tone="success" /> : null}

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Conexión MQTT</Text>
          <Segmented
            value={settings.transport}
            options={[
              { value: 'wss', label: 'WSS (recomendado)' },
              { value: 'tcp', label: 'TCP 1883' },
            ]}
            onChange={v => setField('transport', v as TransportKind)}
          />
          {settings.transport === 'tcp' ? (
            <View style={[styles.warning, { backgroundColor: t.surfaceAlt, borderColor: t.warning }]}>
              <Text style={{ color: t.text }}>
                TCP 1883 no cifra el usuario ni la contraseña. Úsalo solo en red local o con una development build.
              </Text>
            </View>
          ) : null}
          <Field label="URL WebSocket" value={settings.wssUrl} onChangeText={v => setField('wssUrl', v)} />
          <Field label="Host TCP" value={settings.host} onChangeText={v => setField('host', v)} />
          <Field label="Puerto TCP" value={String(settings.port)} keyboardType="number-pad" onChangeText={v => setField('port', Number(v) || 0)} />
          <Field label="Usuario" value={settings.username} onChangeText={v => setField('username', v)} />
          <Field
            label={hasPassword ? 'Contraseña (guardada; escribe para cambiar)' : 'Contraseña'}
            value={password}
            secureTextEntry
            onChangeText={setPassword}
          />
          <Field label="Topic" value={settings.topic} onChangeText={v => setField('topic', v)} />
          <Button label="Guardar y reconectar" onPress={() => void saveConnection()} />
          <Button label="Reconectar ahora" onPress={() => void getStationService().reconnect()} variant="ghost" />
          <Caption>Estado actual: {connection}</Caption>
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>InfluxDB (histórico)</Text>
          <Segmented
            value={settings.historySource}
            options={[
              { value: 'influx', label: 'InfluxDB' },
              { value: 'local', label: 'Local (SQLite)' },
            ]}
            onChange={v => setField('historySource', v as Settings['historySource'])}
          />
          <Field label="URL" value={settings.influx.url} onChangeText={v => settings.update({ influx: { ...settings.influx, url: v } })} />
          <Field label="Organización" value={settings.influx.org} onChangeText={v => settings.update({ influx: { ...settings.influx, org: v } })} />
          <Field label="Bucket" value={settings.influx.bucket} onChangeText={v => settings.update({ influx: { ...settings.influx, bucket: v } })} />
          <Field label="Measurement" value={settings.influx.measurement} onChangeText={v => settings.update({ influx: { ...settings.influx, measurement: v } })} />
          <Field label="Device" value={settings.influx.device} onChangeText={v => settings.update({ influx: { ...settings.influx, device: v } })} />
          <Field
            label={hasToken ? 'Token (guardado; escribe para cambiar)' : 'Token'}
            value={token}
            secureTextEntry
            onChangeText={setToken}
          />
          <Button label="Probar conexión" onPress={() => void testInflux()} variant="ghost" />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Unidades y tema</Text>
          <Segmented
            value={settings.unitsTemp}
            options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]}
            onChange={v => setField('unitsTemp', v as 'C' | 'F')}
          />
          <Segmented
            value={settings.unitsWind}
            options={[
              { value: 'kmh', label: 'km/h' },
              { value: 'ms', label: 'm/s' },
              { value: 'mph', label: 'mph' },
            ]}
            onChange={v => setField('unitsWind', v as Settings['unitsWind'])}
          />
          <Segmented
            value={settings.theme}
            options={[
              { value: 'system', label: 'Sistema' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
            ]}
            onChange={v => setField('theme', v as Settings['theme'])}
          />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Alertas</Text>
          <ToggleRow label="Viento máximo" on={settings.thresholds.windMaxKmh !== null} onChange={on => toggleAlerts('windMaxKmh', on)} />
          <ToggleRow label="Lluvia intensa" on={settings.thresholds.rainDeltaMm !== null} onChange={on => toggleAlerts('rainDeltaMm', on)} />
          <ToggleRow label="Temperatura alta" on={settings.thresholds.tempHighC !== null} onChange={on => toggleAlerts('tempHighC', on)} />
          <ToggleRow label="Temperatura baja" on={settings.thresholds.tempLowC !== null} onChange={on => toggleAlerts('tempLowC', on)} />
          <ToggleRow label="UV alto" on={settings.thresholds.uvi !== null} onChange={on => toggleAlerts('uvi', on)} />
          <ToggleRow label="Batería baja" on={settings.thresholds.batteryLow} onChange={on => settings.update({ thresholds: { batteryLow: on } })} />
          <ToggleRow label="Pérdida de conexión" on={settings.thresholds.connectionLost} onChange={on => settings.update({ thresholds: { connectionLost: on } })} />
          <Caption>Cooldown: {settings.alertCooldownMin} min por tipo de alerta.</Caption>
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Datos</Text>
          <Caption>Retención local: {settings.retentionDays} días</Caption>
          <Button label="Aplicar retención" onPress={() => void applyRetention()} variant="ghost" />
          <Button label="Borrar histórico local" onPress={wipeHistory} variant="danger" />
          <Button label="Restablecer ajustes" onPress={resetAll} variant="ghost" />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Diagnóstico</Text>
          <Caption>Recibidos: {diagnostics.received} · Descartados: {diagnostics.discarded} · Reconexiones: {diagnostics.reconnects}</Caption>
          {logs.slice(0, 8).map((l, i) => (
            <Text key={`${l.at}-${i}`} style={{ color: t.textMuted, fontSize: 12 }}>
              {new Date(l.at).toLocaleTimeString('es-ES')} · {l.message}
            </Text>
          ))}
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Acerca de</Text>
          <Caption>Estación Meteorológica · versión 1.0.0</Caption>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  const t = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Caption>{label}</Caption>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        placeholderTextColor={t.textMuted}
        style={[styles.input, { color: t.text, backgroundColor: t.surfaceAlt }]}
      />
    </View>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: t.surfaceAlt }]} accessibilityRole="radiogroup">
      {options.map(o => {
        const active = o.value === value;
        return (
          <Text
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(o.value)}
            style={[
              styles.segmentItem,
              { color: active ? t.primary : t.textMuted, backgroundColor: active ? t.surface : 'transparent' },
            ]}
          >
            {o.label}
          </Text>
        );
      })}
    </View>
  );
}

function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={styles.toggleRow}>
      <Text style={{ color: t.text, flex: 1 }}>{label}</Text>
      <Switch
        value={on}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: t.primary, false: t.surfaceAlt }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  section: { gap: space.md },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  input: {
    borderRadius: radius.button,
    minHeight: 44,
    paddingHorizontal: space.md,
    fontSize: 15,
  },
  segment: { flexDirection: 'row', borderRadius: radius.chip, padding: space.xs },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: radius.chip,
    fontWeight: '600',
    paddingVertical: space.sm,
  },
  warning: { borderWidth: 1, borderRadius: radius.button, padding: space.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.md },
});
