import type { HistoryPoint } from '@/types/weather';

/**
 * Parser de CSV de InfluxDB (anotaciones `#` y cabeceras repetidas por tabla).
 * Espera la consulta pivotada: columnas `_time`, `temperature`, `humidity`, `wind_avg_km_h`,
 * `wind_max_km_h`, `rain_mm`, `uvi`, `light_lux`, `battery_ok`.
 */
export function parseInfluxCsv(csv: string): HistoryPoint[] {
  const lines = csv.split(/\r?\n/);
  let header: string[] | null = null;
  const points: HistoryPoint[] = [];

  for (const raw of lines) {
    if (!raw || raw.startsWith('#')) continue;
    const cols = splitCsvLine(raw);
    if (cols[0] === '' && cols.includes('_time')) {
      header = cols;
      continue;
    }
    if (!header) continue;
    const row = toRecord(header, cols);
    const t = Date.parse(row._time ?? '');
    if (!Number.isFinite(t)) continue;
    points.push({
      t,
      temperature: numOrNull(row.temperature),
      humidity: numOrNull(row.humidity),
      windAvg: numOrNull(row.wind_avg_km_h),
      windMax: numOrNull(row.wind_max_km_h),
      rainMm: numOrNull(row.rain_mm),
      rainDelta: 0,
      uvi: numOrNull(row.uvi),
      lux: numOrNull(row.light_lux),
    });
  }

  points.sort((a, b) => a.t - b.t);
  return withRainDeltas(points);
}

/** Calcula delta de lluvia sobre la serie acumulada, con detección de reinicio. */
export function withRainDeltas(points: HistoryPoint[]): HistoryPoint[] {
  let prev: number | null = null;
  return points.map(p => {
    let delta = 0;
    if (p.rainMm !== null) {
      if (prev !== null) {
        delta = p.rainMm < prev ? p.rainMm : Math.max(0, p.rainMm - prev);
      }
      prev = p.rainMm;
    }
    return { ...p, rainDelta: delta };
  });
}

function numOrNull(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRecord(header: string[], cols: string[]): Record<string, string | undefined> {
  const rec: Record<string, string | undefined> = {};
  header.forEach((name, i) => {
    if (name) rec[name] = cols[i];
  });
  return rec;
}

/** Divide una línea CSV respetando comillas dobles. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}
