import type { Settings } from '@/types/weather';

export function formatTemp(celsius: number | null, unit: Settings['unitsTemp']): string {
  if (celsius === null) return '—';
  const value = unit === 'F' ? (celsius * 9) / 5 + 32 : celsius;
  return `${value.toFixed(1)}°${unit}`;
}

export function convertWind(kmh: number, unit: Settings['unitsWind']): number {
  if (unit === 'ms') return kmh / 3.6;
  if (unit === 'mph') return kmh / 1.609344;
  return kmh;
}

export function formatWind(kmh: number | null, unit: Settings['unitsWind']): string {
  if (kmh === null) return '—';
  const label = unit === 'ms' ? 'm/s' : unit === 'mph' ? 'mph' : 'km/h';
  return `${convertWind(kmh, unit).toFixed(1)} ${label}`;
}

/** 1 mm de precipitación = 1 L/m². */
export function formatLitres(mm: number | null): string {
  if (mm === null) return '—';
  return `${mm.toFixed(1)} L`;
}

export function formatLitresPerHour(mmPerHour: number | null): string {
  if (mmPerHour === null) return '—';
  return `${mmPerHour.toFixed(1)} L/h`;
}

export function formatNumber(value: number | null, decimals = 0, unit = ''): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const text = value.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit ? `${text} ${unit}` : text;
}
