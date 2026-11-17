import * as SecureStore from 'expo-secure-store';

/** Claves de SecureStore (PRD RF-30). Nunca se escriben en logs ni en AsyncStorage. */
const KEYS = {
  mqttPassword: 'estacion.mqtt.password',
  influxToken: 'estacion.influx.token',
} as const;

export interface Secrets {
  mqttPassword: string;
  influxToken: string;
}

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export async function loadSecrets(): Promise<Secrets> {
  const [mqttPassword, influxToken] = await Promise.all([
    SecureStore.getItemAsync(KEYS.mqttPassword, OPTIONS),
    SecureStore.getItemAsync(KEYS.influxToken, OPTIONS),
  ]);
  return { mqttPassword: mqttPassword ?? '', influxToken: influxToken ?? '' };
}

export async function saveSecrets(secrets: Partial<Secrets>): Promise<void> {
  if (secrets.mqttPassword !== undefined) {
    await SecureStore.setItemAsync(KEYS.mqttPassword, secrets.mqttPassword, OPTIONS);
  }
  if (secrets.influxToken !== undefined) {
    await SecureStore.setItemAsync(KEYS.influxToken, secrets.influxToken, OPTIONS);
  }
}

/**
 * Siembra el token de InfluxDB desde `.env.local` (EXPO_PUBLIC_INFLUX_TOKEN) SOLO en desarrollo.
 * Las variables EXPO_PUBLIC_* se incrustan en el bundle JS, por eso nunca se usan en release.
 * Solo escribe si SecureStore no tiene ya un token, para no pisar cambios hechos en la app.
 */
export async function seedDevInfluxToken(): Promise<void> {
  if (!__DEV__) return;
  const devToken = process.env.EXPO_PUBLIC_INFLUX_TOKEN;
  if (!devToken) return;
  const current = await SecureStore.getItemAsync(KEYS.influxToken, OPTIONS);
  if (!current) {
    await SecureStore.setItemAsync(KEYS.influxToken, devToken, OPTIONS);
  }
}

export async function clearSecrets(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.mqttPassword, OPTIONS),
    SecureStore.deleteItemAsync(KEYS.influxToken, OPTIONS),
  ]);
}
