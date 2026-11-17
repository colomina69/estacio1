import type { AlertEvent, AlertThresholds, AlertType, Reading } from '@/types/weather';

export interface AlertInput {
  reading: Reading;
  thresholds: AlertThresholds;
}

/** Evalúa umbrales sobre una lectura. Devuelve los eventos candidatos (sin aplicar cooldown). */
export function evaluateThresholds({ reading, thresholds: t }: AlertInput): AlertEvent[] {
  const events: AlertEvent[] = [];
  const push = (type: AlertType, value: number | null, threshold: number | null, message: string) =>
    events.push({ type, value, threshold, message });

  if (t.windMaxKmh !== null && reading.windMaxKmh !== null && reading.windMaxKmh > t.windMaxKmh) {
    push('wind_max', reading.windMaxKmh, t.windMaxKmh, `Viento máximo ${reading.windMaxKmh.toFixed(1)} km/h`);
  }
  if (t.rainDeltaMm !== null && reading.rainDeltaMm > t.rainDeltaMm) {
    push('rain_delta', reading.rainDeltaMm, t.rainDeltaMm, `Lluvia intensa: ${reading.rainDeltaMm.toFixed(1)} L`);
  }
  if (t.tempHighC !== null && reading.temperatureC !== null && reading.temperatureC > t.tempHighC) {
    push('temp_high', reading.temperatureC, t.tempHighC, `Temperatura alta: ${reading.temperatureC.toFixed(1)} °C`);
  }
  if (t.tempLowC !== null && reading.temperatureC !== null && reading.temperatureC < t.tempLowC) {
    push('temp_low', reading.temperatureC, t.tempLowC, `Temperatura baja: ${reading.temperatureC.toFixed(1)} °C`);
  }
  if (t.uvi !== null && reading.uvi !== null && reading.uvi >= t.uvi) {
    push('uv', reading.uvi, t.uvi, `Índice UV ${reading.uvi}`);
  }
  if (t.batteryLow && reading.batteryOk === false) {
    push('battery_low', 0, null, 'Batería baja en la estación');
  }
  return events;
}

/**
 * Filtra eventos según el cooldown por tipo (RF-26).
 * `lastFiredAt` mapea tipo → instante del último disparo (ms).
 */
export function applyCooldown(
  events: AlertEvent[],
  lastFiredAt: Partial<Record<AlertType, number>>,
  now: number,
  cooldownMin: number
): AlertEvent[] {
  const cooldownMs = cooldownMin * 60_000;
  return events.filter(e => {
    const last = lastFiredAt[e.type];
    return last === undefined || now - last >= cooldownMs;
  });
}

/** Pérdida de conexión: true si el último dato supera el umbral de obsolescencia. */
export function isConnectionLost(lastMessageAt: number | null, now: number, staleAfterMs: number): boolean {
  return lastMessageAt !== null && now - lastMessageAt > staleAfterMs;
}
