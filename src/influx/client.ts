import { parseInfluxCsv } from '@/influx/csv';
import { buildFluxQuery, chooseWindow } from '@/influx/flux';
import type { HistoryPoint, HistoryRange, Settings } from '@/types/weather';

export interface InfluxConfig {
  url: string;
  org: string;
  bucket: string;
  measurement: string;
  device: string;
  token: string;
}

export class InfluxError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

/** Limpia la URL base y exige HTTPS (PRD §9.3: consultas por HTTPS). */
export function normalizeInfluxUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(trimmed)) {
    throw new InfluxError('La URL de InfluxDB debe empezar por https://');
  }
  return trimmed;
}

/** Consulta el histórico desde InfluxDB 2.x (`POST /api/v2/query`). */
export async function queryHistory(
  cfg: InfluxConfig,
  range: HistoryRange,
  fetchFn: typeof fetch = fetch
): Promise<HistoryPoint[]> {
  const base = normalizeInfluxUrl(cfg.url);
  const query = buildFluxQuery({
    bucket: cfg.bucket,
    measurement: cfg.measurement,
    device: cfg.device,
    range,
    window: chooseWindow(range),
  });
  const res = await fetchFn(`${base}/api/v2/query?org=${encodeURIComponent(cfg.org)}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${cfg.token}`,
      'Content-Type': 'application/vnd.flux',
      Accept: 'application/csv',
    },
    body: query,
  });
  if (res.status === 401 || res.status === 403) {
    throw new InfluxError('Token de InfluxDB no válido o caducado', res.status);
  }
  if (!res.ok) {
    throw new InfluxError(`InfluxDB respondió ${res.status}`, res.status);
  }
  return parseInfluxCsv(await res.text());
}

/** Prueba de conexión: consulta mínima de 1 minuto. Devuelve true si la API responde. */
export async function testInfluxConnection(cfg: InfluxConfig, fetchFn: typeof fetch = fetch): Promise<void> {
  await queryHistory(cfg, { kind: 'preset', hours: 1 }, fetchFn);
}

export function influxConfigFromSettings(settings: Settings, token: string): InfluxConfig {
  return { ...settings.influx, token };
}
