import { rainStartMs, type RainSample } from '@/lib/rain';
import type { HistoryPoint } from '@/types/weather';

export interface Extreme {
  value: number;
  t: number;
}

export interface HistoryStats {
  tempMax: Extreme | null;
  tempMin: Extreme | null;
  windMax: Extreme | null;
  rainStart: number | null;
  rainTotalMm: number;
}

/** Máximos y mínimos con la hora en que ocurrieron (RF-21). */
export function computeStats(points: HistoryPoint[]): HistoryStats {
  let tempMax: Extreme | null = null;
  let tempMin: Extreme | null = null;
  let windMax: Extreme | null = null;
  let rainTotalMm = 0;

  for (const p of points) {
    if (p.temperature !== null) {
      if (!tempMax || p.temperature > tempMax.value) tempMax = { value: p.temperature, t: p.t };
      if (!tempMin || p.temperature < tempMin.value) tempMin = { value: p.temperature, t: p.t };
    }
    if (p.windMax !== null && (!windMax || p.windMax > windMax.value)) {
      windMax = { value: p.windMax, t: p.t };
    }
    rainTotalMm += p.rainDelta;
  }

  const samples: RainSample[] = points
    .filter(p => p.rainMm !== null)
    .map(p => ({ t: p.t, rainMm: p.rainMm as number }));

  return {
    tempMax,
    tempMin,
    windMax,
    rainStart: rainStartMs(samples),
    rainTotalMm,
  };
}

/** Intervalo de tiempo de las gráficas: barras por intervalo de lluvia. */
export function rainBars(points: HistoryPoint[]): { times: number[]; values: number[] } {
  return {
    times: points.map(p => p.t),
    values: points.map(p => p.rainDelta),
  };
}
