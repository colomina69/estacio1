import * as SQLite from 'expo-sqlite';

import type { AlertEvent, HistoryPoint, HistoryRange, Reading } from '@/types/weather';

const DB_NAME = 'estacion.db';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at INTEGER NOT NULL,
  station_time TEXT,
  station_time_ms INTEGER,
  model TEXT,
  station_id INTEGER,
  channel INTEGER,
  battery_ok INTEGER,
  temperature_c REAL,
  humidity REAL,
  wind_avg_kmh REAL,
  wind_max_kmh REAL,
  wind_dir_deg INTEGER,
  rain_mm REAL,
  rain_delta_mm REAL,
  uvi REAL,
  light_lux REAL,
  mic TEXT,
  mic_valid INTEGER,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_readings_received_at ON readings (received_at);

CREATE TABLE IF NOT EXISTS alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fired_at INTEGER NOT NULL,
  type TEXT NOT NULL,
  value REAL,
  threshold REAL,
  message TEXT
);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(SCHEMA);
      return db;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

export async function insertReading(r: Reading): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO readings (received_at, station_time, station_time_ms, model, station_id, channel, battery_ok,
      temperature_c, humidity, wind_avg_kmh, wind_max_kmh, wind_dir_deg, rain_mm, rain_delta_mm, uvi, light_lux,
      mic, mic_valid, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.receivedAt,
    r.stationTime,
    r.stationTimeMs,
    r.model,
    r.stationId,
    r.channel,
    r.batteryOk === null ? null : r.batteryOk ? 1 : 0,
    r.temperatureC,
    r.humidity,
    r.windAvgKmh,
    r.windMaxKmh,
    r.windDirDeg,
    r.rainMm,
    r.rainDeltaMm,
    r.uvi,
    r.lightLux,
    r.mic,
    r.micValid ? 1 : 0,
    r.rawJson
  );
}

export interface ReadingRow {
  received_at: number;
  temperature_c: number | null;
  humidity: number | null;
  wind_avg_kmh: number | null;
  wind_max_kmh: number | null;
  rain_mm: number | null;
  rain_delta_mm: number | null;
  uvi: number | null;
  light_lux: number | null;
}

/** Último rain_mm conocido, para calcular el delta de la siguiente lectura. */
export async function lastRainMm(): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ rain_mm: number | null }>(
    'SELECT rain_mm FROM readings WHERE rain_mm IS NOT NULL ORDER BY received_at DESC, id DESC LIMIT 1'
  );
  return row?.rain_mm ?? null;
}

/** Suma de deltas de lluvia desde medianoche local (RF-15: "lluvia de hoy"). */
export async function rainTodayMm(startOfDayMs: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(rain_delta_mm) AS total FROM readings WHERE received_at >= ?',
    startOfDayMs
  );
  return row?.total ?? 0;
}

/** Muestras de lluvia desde `sinceMs`, para calcular la intensidad máxima. */
export async function rainSamplesSince(sinceMs: number): Promise<{ t: number; rainMm: number }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ received_at: number; rain_mm: number }>(
    'SELECT received_at, rain_mm FROM readings WHERE received_at >= ? AND rain_mm IS NOT NULL ORDER BY received_at ASC',
    sinceMs
  );
  return rows.map(r => ({ t: r.received_at, rainMm: r.rain_mm }));
}

/** Lecturas en un rango, ordenadas, para gráficas locales (fallback SQLite, Ajustes). */
export async function queryLocalHistory(range: HistoryRange, now = Date.now()): Promise<HistoryPoint[]> {
  const db = await getDb();
  const [start, end] =
    range.kind === 'preset'
      ? [now - range.hours * 3_600_000, now]
      : [range.startMs, range.endMs];
  const rows = await db.getAllAsync<ReadingRow>(
    `SELECT received_at, temperature_c, humidity, wind_avg_kmh, wind_max_kmh, rain_mm, rain_delta_mm, uvi, light_lux
       FROM readings WHERE received_at BETWEEN ? AND ? ORDER BY received_at ASC`,
    start,
    end
  );
  return rows.map(r => ({
    t: r.received_at,
    temperature: r.temperature_c,
    humidity: r.humidity,
    windAvg: r.wind_avg_kmh,
    windMax: r.wind_max_kmh,
    rainMm: r.rain_mm,
    rainDelta: r.rain_delta_mm ?? 0,
    uvi: r.uvi,
    lux: r.light_lux,
  }));
}

export async function insertAlert(e: AlertEvent, firedAt: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO alert_events (fired_at, type, value, threshold, message) VALUES (?, ?, ?, ?, ?)',
    firedAt,
    e.type,
    e.value,
    e.threshold,
    e.message
  );
}

/** Purga lecturas y alertas anteriores a `now − retentionDays` (RF-20, RF-23). */
export async function purgeOlderThan(retentionDays: number, now = Date.now()): Promise<number> {
  const db = await getDb();
  const cutoff = now - retentionDays * 86_400_000;
  const res = await db.runAsync('DELETE FROM readings WHERE received_at < ?', cutoff);
  await db.runAsync('DELETE FROM alert_events WHERE fired_at < ?', cutoff);
  return res.changes;
}

export async function clearHistory(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM readings; DELETE FROM alert_events;');
}
