/**
 * Lluvia acumulada (PRD §8.4). `rain_mm` es un contador acumulado que puede reiniciarse.
 */

/** Delta entre dos lecturas acumuladas. Si el contador se reinicia, usa el valor actual. */
export function rainDelta(previous: number | null, current: number | null): number {
  if (current === null || !Number.isFinite(current)) return 0;
  if (previous === null || !Number.isFinite(previous)) return 0;
  if (current < previous) return current;
  return Math.max(0, current - previous);
}

export interface RainSample {
  t: number;
  rainMm: number;
}

/** Intensidad máxima (mm/h). Ignora intervalos menores de 5 s. */
export function maxIntensityMmPerHour(samples: RainSample[]): number {
  let max = 0;
  for (let i = 1; i < samples.length; i++) {
    const dtMs = samples[i].t - samples[i - 1].t;
    if (dtMs < 5000) continue;
    const delta = rainDelta(samples[i - 1].rainMm, samples[i].rainMm);
    if (delta <= 0) continue;
    const perHour = delta / (dtMs / 3_600_000);
    if (perHour > max) max = perHour;
  }
  return max;
}

/** Instante de inicio del primer tramo con lluvia (delta > 0). */
export function rainStartMs(samples: RainSample[]): number | null {
  for (let i = 1; i < samples.length; i++) {
    if (rainDelta(samples[i - 1].rainMm, samples[i].rainMm) > 0) {
      return samples[i - 1].t;
    }
  }
  return null;
}
