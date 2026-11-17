import type { HistoryRange } from '@/types/weather';

export type RangeError = 'end_before_start' | 'same_instant' | 'in_future' | 'too_long';

const MAX_RANGE_DAYS = 30; // coherente con la retención por defecto (PRD §3.2)

/** Valida un rango personalizado (PRD CA-12). Devuelve null si es válido. */
export function validateCustomRange(startMs: number, endMs: number, now = Date.now()): RangeError | null {
  if (endMs === startMs) return 'same_instant';
  if (endMs < startMs) return 'end_before_start';
  if (endMs > now + 60_000) return 'in_future';
  if (endMs - startMs > MAX_RANGE_DAYS * 86_400_000) return 'too_long';
  return null;
}

export const RANGE_ERROR_MESSAGE: Record<RangeError, string> = {
  end_before_start: 'La fecha final debe ser posterior a la inicial.',
  same_instant: 'Elige un inicio y un fin distintos.',
  in_future: 'La fecha final no puede estar en el futuro.',
  too_long: `El rango no puede superar ${MAX_RANGE_DAYS} días.`,
};

export function toHistoryRange(preset: 1 | 24 | 168 | 'custom', startMs: number, endMs: number): HistoryRange {
  if (preset === 'custom') return { kind: 'custom', startMs, endMs };
  return { kind: 'preset', hours: preset };
}
