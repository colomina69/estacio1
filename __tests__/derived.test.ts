import { cardinal16, dewPointC, feelsLikeC, lightCategory, uvCategory, windChillC } from '@/lib/derived';
import { maxIntensityMmPerHour, rainDelta, rainStartMs } from '@/lib/rain';
import { convertWind, formatLitres, formatTemp } from '@/lib/units';
import { parseStationTime } from '@/lib/time';

describe('dewPointC (Magnus)', () => {
  it('coincide con el punto de rocío de referencia (20 °C, 50 % ≈ 9.3 °C)', () => {
    expect(dewPointC(20, 50)).toBeCloseTo(9.3, 1);
  });
  it('devuelve null con humedad no válida', () => {
    expect(dewPointC(20, 0)).toBeNull();
  });
  it('la humedad 100 % iguala la temperatura', () => {
    expect(dewPointC(15, 100)).toBeCloseTo(15, 5);
  });
});

describe('windChillC', () => {
  it('es menor que la temperatura con viento', () => {
    expect(windChillC(0, 20)).toBeLessThan(0);
  });
});

describe('feelsLikeC', () => {
  it('aplica wind chill con T ≤ 10 y viento > 4.8 km/h', () => {
    expect(feelsLikeC(5, 60, 20)).toBeCloseTo(windChillC(5, 20), 5);
  });
  it('aplica índice de calor con T ≥ 27', () => {
    const v = feelsLikeC(32, 60, 2);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(32);
  });
  it('devuelve la temperatura real en condiciones intermedias', () => {
    expect(feelsLikeC(21.3, 46, 2.4)).toBe(21.3);
  });
  it('devuelve null sin temperatura', () => {
    expect(feelsLikeC(null, 50, 5)).toBeNull();
  });
});

describe('cardinal16', () => {
  it.each([
    [0, 'N'],
    [322, 'NO'],
    [90, 'E'],
    [180, 'S'],
    [359, 'N'],
    [-10, 'N'],
  ])('%p° → %s', (deg, expected) => {
    expect(cardinal16(deg)).toBe(expected);
  });
  it('null cuando no hay dato', () => {
    expect(cardinal16(null)).toBeNull();
  });
});

describe('uvCategory', () => {
  it.each([
    [0, 'Bajo'],
    [2.9, 'Bajo'],
    [3, 'Moderado'],
    [6, 'Alto'],
    [8, 'Muy alto'],
    [11, 'Extremo'],
  ])('UV %p → %s', (uvi, expected) => {
    expect(uvCategory(uvi)).toBe(expected);
  });
});

describe('lightCategory', () => {
  it('clasifica la luminosidad', () => {
    expect(lightCategory(5)).toBe('Noche');
    expect(lightCategory(5695)).toBe('Nublado');
    expect(lightCategory(50000)).toBe('Soleado');
  });
});

describe('rainDelta', () => {
  it('calcula el incremento', () => {
    expect(rainDelta(10, 12.5)).toBeCloseTo(2.5);
  });
  it('nunca es negativo y detecta reinicio del contador', () => {
    expect(rainDelta(125, 0.4)).toBe(0.4);
    expect(rainDelta(10, 10)).toBe(0);
  });
  it('sin valor previo no suma lluvia', () => {
    expect(rainDelta(null, 50)).toBe(0);
  });
});

describe('maxIntensityMmPerHour', () => {
  it('toma el máximo de delta/hora e ignora intervalos menores de 5 s', () => {
    const base = 0;
    const samples = [
      { t: base, rainMm: 0 },
      { t: base + 60_000, rainMm: 1 }, // 1 mm en 1 min = 60 mm/h
      { t: base + 62_000, rainMm: 2 }, // 2 s: ignorado
      { t: base + 3_660_000, rainMm: 2.5 }, // 0.5 mm en 1 h = 0.5 mm/h
    ];
    expect(maxIntensityMmPerHour(samples)).toBeCloseTo(60, 5);
  });
  it('devuelve 0 sin lluvia', () => {
    expect(maxIntensityMmPerHour([{ t: 0, rainMm: 5 }, { t: 60_000, rainMm: 5 }])).toBe(0);
  });
  it('rainStartMs devuelve el inicio del primer tramo con lluvia', () => {
    const s = [
      { t: 1000, rainMm: 0 },
      { t: 2000, rainMm: 0 },
      { t: 3000, rainMm: 0.2 },
    ];
    expect(rainStartMs(s)).toBe(2000);
  });
});

describe('unidades', () => {
  it('convierte viento a m/s y mph', () => {
    expect(convertWind(36, 'ms')).toBeCloseTo(10, 5);
    expect(convertWind(16.09344, 'mph')).toBeCloseTo(10, 4);
  });
  it('convierte temperatura a °F', () => {
    expect(formatTemp(100, 'F')).toBe('212.0°F');
    expect(formatTemp(null, 'C')).toBe('—');
  });
  it('muestra la lluvia en litros (1 mm = 1 L/m²)', () => {
    expect(formatLitres(125.12099)).toBe('125.1 L');
  });
});

describe('parseStationTime', () => {
  it('parsea YYYY-MM-DD HH:mm:ss como hora local', () => {
    const ms = parseStationTime('2026-11-12 16:03:17');
    expect(ms).toBe(new Date(2026, 10, 12, 16, 3, 17).getTime());
  });
  it('rechaza formatos y fechas inexistentes', () => {
    expect(parseStationTime('2026-02-30 10:00:00')).toBeNull();
    expect(parseStationTime('nope')).toBeNull();
    expect(parseStationTime(123)).toBeNull();
  });
});
