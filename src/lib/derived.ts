/**
 * Métricas derivadas (PRD §8.4). Funciones puras, sin dependencias nativas.
 */

/** Punto de rocío por la fórmula de Magnus. T en °C, RH en %. */
export function dewPointC(tempC: number, rh: number): number | null {
  if (!Number.isFinite(tempC) || !Number.isFinite(rh) || rh <= 0) return null;
  const gamma = Math.log(rh / 100) + (17.62 * tempC) / (243.12 + tempC);
  return (243.12 * gamma) / (17.62 - gamma);
}

/** Sensación térmica por viento frío (T ≤ 10 °C y v > 4.8 km/h). */
export function windChillC(tempC: number, windKmh: number): number {
  const v16 = Math.pow(windKmh, 0.16);
  return 13.12 + 0.6215 * tempC - 11.37 * v16 + 0.3965 * tempC * v16;
}

/** Índice de calor por la ecuación de Rothfusz (T ≥ 27 °C). Entrada/salida en °C. */
export function heatIndexC(tempC: number, rh: number): number {
  const t = tempC * 1.8 + 32;
  const r = rh;
  const hiF =
    -42.379 +
    2.04901523 * t +
    10.14333127 * r -
    0.22475541 * t * r -
    0.00683783 * t * t -
    0.05481717 * r * r +
    0.00122874 * t * t * r +
    0.00085282 * t * r * r -
    0.00000199 * t * t * r * r;
  return ((hiF - 32) * 5) / 9;
}

/** Temperatura percibida: viento frío, índice de calor o temperatura real. */
export function feelsLikeC(
  tempC: number | null,
  humidity: number | null,
  windKmh: number | null
): number | null {
  if (tempC === null) return null;
  if (tempC <= 10 && windKmh !== null && windKmh > 4.8) {
    return windChillC(tempC, windKmh);
  }
  if (tempC >= 27 && humidity !== null) {
    return heatIndexC(tempC, humidity);
  }
  return tempC;
}

const CARDINALS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO',
] as const;

/** Rumbo cardinal (16 rumbos) a partir de grados. */
export function cardinal16(deg: number | null): string | null {
  if (deg === null || !Number.isFinite(deg)) return null;
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return CARDINALS[index];
}

export type UvCategory = 'Bajo' | 'Moderado' | 'Alto' | 'Muy alto' | 'Extremo';

export function uvCategory(uvi: number | null): UvCategory | null {
  if (uvi === null || !Number.isFinite(uvi)) return null;
  if (uvi < 3) return 'Bajo';
  if (uvi < 6) return 'Moderado';
  if (uvi < 8) return 'Alto';
  if (uvi < 11) return 'Muy alto';
  return 'Extremo';
}

export type LightCategory = 'Noche' | 'Penumbra' | 'Nublado' | 'Soleado';

export function lightCategory(lux: number | null): LightCategory | null {
  if (lux === null || !Number.isFinite(lux)) return null;
  if (lux < 10) return 'Noche';
  if (lux < 1000) return 'Penumbra';
  if (lux < 30000) return 'Nublado';
  return 'Soleado';
}
