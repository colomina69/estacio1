import type { HistoryRange } from '@/types/weather';

export type WindowSpec = '1m' | '5m' | '30m' | string;

const MAX_POINTS = 500;

/**
 * Elige la ventana de agregación (PRD RF-22):
 * 1 h → 1 min, 24 h → 5 min, 7 d → 30 min; rango personalizado → ventana que no supere ~500 puntos.
 */
export function chooseWindow(range: HistoryRange): WindowSpec {
  if (range.kind === 'preset') {
    if (range.hours === 1) return '1m';
    if (range.hours === 24) return '5m';
    return '30m';
  }
  const spanMin = Math.max(1, (range.endMs - range.startMs) / 60_000);
  const minutes = Math.ceil(spanMin / MAX_POINTS);
  return `${Math.max(1, minutes)}m`;
}

/** Fecha/hora de inicio y fin en RFC3339 para Flux. */
export function rangeBounds(range: HistoryRange, now: number = Date.now()): { start: string; stop: string } {
  if (range.kind === 'preset') {
    return {
      start: new Date(now - range.hours * 3_600_000).toISOString(),
      stop: new Date(now).toISOString(),
    };
  }
  return {
    start: new Date(range.startMs).toISOString(),
    stop: new Date(range.endMs).toISOString(),
  };
}

/** Función de agregación por campo (PRD §9.3): mean o max. */
const FIELD_AGG: Record<string, 'mean' | 'max'> = {
  temperature: 'mean',
  humidity: 'mean',
  wind_avg_km_h: 'mean',
  wind_max_km_h: 'max',
  rain_mm: 'max',
  uvi: 'mean',
  light_lux: 'mean',
  battery_ok: 'max',
};

export const INFLUX_FIELDS = Object.keys(FIELD_AGG);

/** Escapa un valor para usarlo dentro de una cadena Flux entre comillas dobles. */
export function fluxString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Construye la consulta Flux: un stream por campo con aggregateWindow, unidos, pivotados y ordenados. */
export function buildFluxQuery(opts: {
  bucket: string;
  measurement: string;
  device: string;
  range: HistoryRange;
  window: WindowSpec;
  now?: number;
}): string {
  const { start, stop } = rangeBounds(opts.range, opts.now);
  const streams = INFLUX_FIELDS.map(field => {
    const agg = FIELD_AGG[field];
    return `  s_${field} = from(bucket: ${fluxString(opts.bucket)})
    |> range(start: ${start}, stop: ${stop})
    |> filter(fn: (r) => r._measurement == ${fluxString(opts.measurement)})
    |> filter(fn: (r) => r.device == ${fluxString(opts.device)})
    |> filter(fn: (r) => r._field == ${fluxString(field)})
    |> aggregateWindow(every: ${opts.window}, fn: ${agg}, createEmpty: false)`;
  });
  const names = INFLUX_FIELDS.map(f => `s_${f}`);
  const union = `union(tables: [${names.join(', ')}])`;
  return `${streams.join('\n')}
${union}
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"])`;
}
