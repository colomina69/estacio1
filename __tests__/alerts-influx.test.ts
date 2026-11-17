import { applyCooldown, evaluateThresholds, isConnectionLost } from '@/alerts/evaluate';
import { parseInfluxCsv, splitCsvLine, withRainDeltas } from '@/influx/csv';
import { buildFluxQuery, chooseWindow, fluxString } from '@/influx/flux';
import { normalizeInfluxUrl } from '@/influx/client';
import { DEFAULT_SETTINGS } from '@/config/defaults';
import type { Reading } from '@/types/weather';

function reading(overrides: Partial<Reading> = {}): Reading {
  return {
    receivedAt: 0,
    stationTime: null,
    stationTimeMs: null,
    model: null,
    stationId: null,
    channel: null,
    batteryOk: true,
    temperatureC: 20,
    humidity: 50,
    windAvgKmh: 5,
    windMaxKmh: 10,
    windDirDeg: 0,
    rainMm: 0,
    rainDeltaMm: 0,
    uvi: 1,
    lightLux: 1000,
    mic: 'CHECKSUM',
    micValid: true,
    rawJson: '{}',
    ...overrides,
  };
}

describe('evaluateThresholds', () => {
  const t = DEFAULT_SETTINGS.thresholds;

  it('no genera alertas con valores normales', () => {
    expect(evaluateThresholds({ reading: reading(), thresholds: t })).toEqual([]);
  });

  it('dispara viento máximo por encima del umbral (CA-07)', () => {
    const ev = evaluateThresholds({ reading: reading({ windMaxKmh: 41 }), thresholds: t });
    expect(ev.map(e => e.type)).toContain('wind_max');
  });

  it('dispara batería baja solo si battery_ok es 0', () => {
    const ev = evaluateThresholds({ reading: reading({ batteryOk: false }), thresholds: t });
    expect(ev.map(e => e.type)).toContain('battery_low');
    const none = evaluateThresholds({ reading: reading({ batteryOk: null }), thresholds: t });
    expect(none.map(e => e.type)).not.toContain('battery_low');
  });

  it('ignora umbrales desactivados (null)', () => {
    const ev = evaluateThresholds({
      reading: reading({ windMaxKmh: 200 }),
      thresholds: { ...t, windMaxKmh: null },
    });
    expect(ev).toEqual([]);
  });
});

describe('applyCooldown (CA-07)', () => {
  const minute = 60_000;
  it('bloquea repetición dentro del cooldown y permite después', () => {
    const ev = [{ type: 'wind_max' as const, value: 41, threshold: 40, message: 'm' }];
    const last = { wind_max: 0 };
    expect(applyCooldown(ev, last, 10 * minute, 30)).toEqual([]);
    expect(applyCooldown(ev, last, 30 * minute, 30)).toHaveLength(1);
  });
  it('el cooldown es por tipo', () => {
    const ev = [
      { type: 'uv' as const, value: 9, threshold: 8, message: 'u' },
    ];
    expect(applyCooldown(ev, { wind_max: 0 }, 1 * minute, 30)).toHaveLength(1);
  });
});

describe('isConnectionLost', () => {
  it('true cuando supera el umbral de obsolescencia', () => {
    expect(isConnectionLost(0, 6 * 60_000, 5 * 60_000)).toBe(true);
    expect(isConnectionLost(0, 4 * 60_000, 5 * 60_000)).toBe(false);
    expect(isConnectionLost(null, 10 * 60_000, 5 * 60_000)).toBe(false);
  });
});

describe('chooseWindow (RF-22)', () => {
  it('ventanas fijas para 1 h, 24 h y 7 d', () => {
    expect(chooseWindow({ kind: 'preset', hours: 1 })).toBe('1m');
    expect(chooseWindow({ kind: 'preset', hours: 24 })).toBe('5m');
    expect(chooseWindow({ kind: 'preset', hours: 168 })).toBe('30m');
  });
  it('rango personalizado no supera ~500 puntos', () => {
    const start = 0;
    const end = 7 * 24 * 3_600_000; // 7 días = 10080 min → 10080/500 = 21 min
    expect(chooseWindow({ kind: 'custom', startMs: start, endMs: end })).toBe('21m');
  });
});

describe('buildFluxQuery', () => {
  it('genera un stream por campo con aggregateWindow y pivot', () => {
    const q = buildFluxQuery({
      bucket: 'my-bucket',
      measurement: 'vevor_7in1',
      device: '7907',
      range: { kind: 'preset', hours: 24 },
      window: '5m',
      now: Date.UTC(2026, 10, 12, 12, 0, 0),
    });
    expect(q).toContain('from(bucket: "my-bucket")');
    expect(q).toContain('r._measurement == "vevor_7in1"');
    expect(q).toContain('r.device == "7907"');
    expect(q).toContain('aggregateWindow(every: 5m, fn: max');
    expect(q).toContain('pivot(rowKey: ["_time"]');
    expect(q).toContain('union(tables:');
  });
  it('escapa comillas en los parámetros', () => {
    expect(fluxString('a"b')).toBe('"a\\"b"');
  });
});

describe('parseInfluxCsv', () => {
  const csv = [
    '#datatype,string,long,dateTime:RFC3339',
    ',result,table,_time,temperature,humidity,wind_avg_km_h,wind_max_km_h,rain_mm,uvi,light_lux,battery_ok',
    ',_result,0,2026-11-12T10:00:00Z,20.5,50,2,3,100,0,5000,1',
    ',_result,0,2026-11-12T10:05:00Z,21.0,48,2.5,4,100.4,0,5200,1',
    ',_result,0,2026-11-12T10:10:00Z,21.5,47,3,5,0.2,0,5300,1',
    '',
  ].join('\n');

  it('convierte filas a HistoryPoint ordenados', () => {
    const pts = parseInfluxCsv(csv);
    expect(pts).toHaveLength(3);
    expect(pts[0].temperature).toBe(20.5);
    expect(pts[0].t).toBe(Date.parse('2026-11-12T10:00:00Z'));
  });

  it('deriva el delta de lluvia y detecta reinicio del contador', () => {
    const pts = parseInfluxCsv(csv);
    expect(pts[0].rainDelta).toBe(0);
    expect(pts[1].rainDelta).toBeCloseTo(0.4);
    expect(pts[2].rainDelta).toBeCloseTo(0.2); // reinicio: usa el valor actual
  });

  it('ignora filas sin fecha válida', () => {
    expect(parseInfluxCsv(',result,table,_time\n,_result,0,notadate')).toEqual([]);
  });
});

describe('splitCsvLine y withRainDeltas', () => {
  it('respeta comillas con comas', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });
  it('withRainDeltas no produce deltas negativos', () => {
    const out = withRainDeltas([
      { t: 1, temperature: null, humidity: null, windAvg: null, windMax: null, rainMm: 5, rainDelta: 0, uvi: null, lux: null },
      { t: 2, temperature: null, humidity: null, windAvg: null, windMax: null, rainMm: 3, rainDelta: 0, uvi: null, lux: null },
    ]);
    expect(out[1].rainDelta).toBe(3);
    expect(out.every(p => p.rainDelta >= 0)).toBe(true);
  });
});

describe('normalizeInfluxUrl', () => {
  it('elimina barras finales y exige https', () => {
    expect(normalizeInfluxUrl('https://influx.benicolo.com/')).toBe('https://influx.benicolo.com');
    expect(() => normalizeInfluxUrl('http://x')).toThrow();
  });
});
