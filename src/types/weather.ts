export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'error';

export type TransportKind = 'wss' | 'tcp';

/** Lectura validada y normalizada a partir del payload de rtl_433. */
export interface Reading {
  receivedAt: number;
  stationTime: string | null;
  stationTimeMs: number | null;
  model: string | null;
  stationId: number | null;
  channel: number | null;
  batteryOk: boolean | null;
  temperatureC: number | null;
  humidity: number | null;
  windAvgKmh: number | null;
  windMaxKmh: number | null;
  windDirDeg: number | null;
  rainMm: number | null;
  rainDeltaMm: number;
  uvi: number | null;
  lightLux: number | null;
  mic: string | null;
  micValid: boolean;
  rawJson: string;
}

/** Punto de histórico normalizado (procedente de InfluxDB o SQLite). */
export interface HistoryPoint {
  t: number;
  temperature: number | null;
  humidity: number | null;
  windAvg: number | null;
  windMax: number | null;
  rainMm: number | null;
  rainDelta: number;
  uvi: number | null;
  lux: number | null;
}

export type HistoryRange =
  | { kind: 'preset'; hours: 1 | 24 | 168 }
  | { kind: 'custom'; startMs: number; endMs: number };

export type HistorySource = 'influx' | 'local';

export interface Settings {
  transport: TransportKind;
  wssUrl: string;
  host: string;
  port: number;
  username: string;
  topic: string;
  unitsTemp: 'C' | 'F';
  unitsWind: 'kmh' | 'ms' | 'mph';
  theme: 'system' | 'light' | 'dark';
  retentionDays: number;
  historySource: HistorySource;
  influx: {
    url: string;
    org: string;
    bucket: string;
    measurement: string;
    device: string;
  };
  thresholds: AlertThresholds;
  alertCooldownMin: number;
}

export interface AlertThresholds {
  windMaxKmh: number | null;
  rainDeltaMm: number | null;
  tempHighC: number | null;
  tempLowC: number | null;
  uvi: number | null;
  batteryLow: boolean;
  connectionLost: boolean;
}

export type AlertType =
  | 'wind_max'
  | 'rain_delta'
  | 'temp_high'
  | 'temp_low'
  | 'uv'
  | 'battery_low'
  | 'connection_lost';

export interface AlertEvent {
  type: AlertType;
  value: number | null;
  threshold: number | null;
  message: string;
}
