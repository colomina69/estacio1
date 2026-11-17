import type { Settings } from '@/types/weather';

/**
 * Valores por defecto (PRD RF-31). El password NO se incluye: se introduce en Ajustes y se guarda en SecureStore.
 */
export const DEFAULT_SETTINGS: Settings = {
  transport: 'wss',
  wssUrl: 'wss://mqtt.benicolo.com/mqtt',
  host: 'mqtt.benicolo.com',
  port: 1883,
  username: 'toni',
  topic: 'rtl_433/chuwi/events',
  unitsTemp: 'C',
  unitsWind: 'kmh',
  theme: 'system',
  retentionDays: 30,
  historySource: 'influx',
  influx: {
    url: 'https://influx.benicolo.com',
    org: 'my-org',
    bucket: 'my-bucket',
    measurement: 'vevor_7in1',
    device: '7907',
  },
  thresholds: {
    windMaxKmh: 40,
    rainDeltaMm: 5,
    tempHighC: 35,
    tempLowC: -5,
    uvi: 8,
    batteryLow: true,
    connectionLost: true,
  },
  alertCooldownMin: 30,
};

/** Tiempo sin mensajes tras el cual el dato se considera obsoleto (RF-08). */
export const STALE_AFTER_MS = 5 * 60 * 1000;

export const MQTT_CLIENT_ID_PREFIX = 'estacio-android-';
