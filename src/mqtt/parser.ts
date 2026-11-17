import { rainDelta } from '@/lib/rain';
import { parseStationTime } from '@/lib/time';
import type { Reading } from '@/types/weather';

/** Límite de tamaño de un payload. Mensajes mayores se descartan sin parsear. */
export const MAX_PAYLOAD_BYTES = 8 * 1024;

const KNOWN_FIELDS = new Set([
  'time', 'model', 'id', 'channel', 'battery_ok', 'temperature_C', 'humidity',
  'wind_avg_km_h', 'wind_max_km_h', 'wind_dir_deg', 'rain_mm', 'uvi', 'light_lux', 'mic',
]);

export type ParseResult =
  | { ok: true; reading: Reading; unknownFields: string[] }
  | { ok: false; reason: 'too_large' | 'invalid_json' | 'not_object' };

function num(value: unknown, min?: number, max?: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (min !== undefined && value < min) return null;
  if (max !== undefined && value > max) return null;
  return value;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : null;
}

/**
 * Parseo tolerante del JSON de rtl_433 (PRD RF-09, RF-10, RF-11).
 * Campos ausentes o inválidos quedan en null; nunca lanza excepciones.
 * `previousRainMm` permite calcular el delta de lluvia con detección de reinicio (RF-12).
 */
export function parseReading(
  raw: string,
  receivedAt: number,
  previousRainMm: number | null = null
): ParseResult {
  if (raw.length > MAX_PAYLOAD_BYTES) return { ok: false, reason: 'too_large' };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, reason: 'not_object' };
  }

  const o = data as Record<string, unknown>;
  const stationTime = str(o.time);
  const stationTimeMs = parseStationTime(o.time);
  const rainMm = num(o.rain_mm, 0);
  const mic = str(o.mic);

  const reading: Reading = {
    receivedAt,
    stationTime,
    stationTimeMs,
    model: str(o.model),
    stationId: num(o.id),
    channel: num(o.channel),
    batteryOk: o.battery_ok === undefined || o.battery_ok === null ? null : Boolean(o.battery_ok),
    temperatureC: num(o.temperature_C, -40, 60),
    humidity: num(o.humidity, 0, 100),
    windAvgKmh: num(o.wind_avg_km_h, 0, 200),
    windMaxKmh: num(o.wind_max_km_h, 0, 250),
    windDirDeg: num(o.wind_dir_deg, 0, 359),
    rainMm,
    rainDeltaMm: rainDelta(previousRainMm, rainMm),
    uvi: num(o.uvi, 0, 15),
    lightLux: num(o.light_lux, 0, 150_000),
    mic,
    micValid: mic === 'CHECKSUM',
    rawJson: raw,
  };

  const unknownFields = Object.keys(o).filter(k => !KNOWN_FIELDS.has(k));
  return { ok: true, reading, unknownFields };
}
