import {
  decodePacket,
  encodeConnect,
  encodePingReq,
  encodeRemainingLength,
  encodeSubscribe,
  IncompletePacket,
  PacketStream,
} from '@/mqtt/codec';
import { backoffDelayMs, MqttClient, type ClientEvent } from '@/mqtt/client';
import { MAX_PAYLOAD_BYTES, parseReading } from '@/mqtt/parser';
import type { Transport } from '@/mqtt/transport';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const enc = (s: string) => new TextEncoder().encode(s);

describe('codec: longitud restante', () => {
  it.each([
    [0, [0]],
    [127, [127]],
    [128, [0x80, 0x01]],
    [16_383, [0xff, 0x7f]],
    [16_384, [0x80, 0x80, 0x01]],
  ])('%p → %j', (len, expected) => {
    expect(encodeRemainingLength(len)).toEqual(expected);
  });
});

describe('codec: CONNECT', () => {
  it('codifica cabecera, protocolo MQTT 3.1.1 y flags de usuario/password', () => {
    const bytes = encodeConnect({
      clientId: 'c1',
      username: 'toni',
      password: 'x',
      keepAliveSec: 60,
      cleanSession: true,
    });
    expect(bytes[0]).toBe(0x10);
    // "MQTT" con longitud 4 tras la cabecera fija (1 byte tipo + 1 byte longitud)
    expect(Array.from(bytes.subarray(2, 8))).toEqual([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54]);
    expect(bytes[8]).toBe(0x04); // nivel 3.1.1
    expect(bytes[9]).toBe(0x02 | 0x80 | 0x40); // clean + user + pass
    expect(bytes[10]).toBe(0x00);
    expect(bytes[11]).toBe(60);
  });
});

describe('codec: SUBSCRIBE y PINGREQ', () => {
  it('SUBSCRIBE usa QoS 0 y el topic indicado', () => {
    const bytes = encodeSubscribe('rtl_433/chuwi/events', 0, 1);
    expect(bytes[0]).toBe(0x82);
    const body = bytes.subarray(2);
    expect(Array.from(body.subarray(0, 2))).toEqual([0x00, 0x01]);
    const topicLen = (body[2] << 8) | body[3];
    expect(new TextDecoder().decode(body.subarray(4, 4 + topicLen))).toBe('rtl_433/chuwi/events');
    expect(body[body.length - 1]).toBe(0);
  });
  it('PINGREQ es 0xC0 0x00', () => {
    expect(Array.from(encodePingReq())).toEqual([0xc0, 0x00]);
  });
});

describe('codec: decodePacket', () => {
  it('decodifica CONNACK aceptado', () => {
    const { packet, consumed } = decodePacket(Uint8Array.of(0x20, 0x02, 0x00, 0x00));
    expect(packet).toEqual({ type: 'connack', sessionPresent: false, returnCode: 0 });
    expect(consumed).toBe(4);
  });
  it('decodifica CONNACK con código 4 (credenciales)', () => {
    const { packet } = decodePacket(Uint8Array.of(0x20, 0x02, 0x00, 0x04));
    expect(packet).toEqual({ type: 'connack', sessionPresent: false, returnCode: 4 });
  });
  it('decodifica PUBLISH QoS 0', () => {
    const topic = enc('a/b');
    const payload = enc('{"x":1}');
    const body = new Uint8Array([0, topic.length, ...topic, ...payload]);
    const bytes = new Uint8Array([0x30, body.length, ...body]);
    const { packet } = decodePacket(bytes);
    expect(packet).toEqual({ type: 'publish', topic: 'a/b', payload: '{"x":1}', qos: 0, packetId: undefined });
  });
  it('lanza IncompletePacket si faltan bytes', () => {
    expect(() => decodePacket(Uint8Array.of(0x30, 0x10, 0x00))).toThrow(IncompletePacket);
  });
});

describe('PacketStream', () => {
  it('reensambla un paquete partido en dos trozos', () => {
    const stream = new PacketStream();
    const full = Uint8Array.of(0x20, 0x02, 0x00, 0x00);
    expect(stream.push(full.subarray(0, 2))).toEqual([]);
    expect(stream.push(full.subarray(2))).toEqual([
      { type: 'connack', sessionPresent: false, returnCode: 0 },
    ]);
  });
  it('extrae varios paquetes de un solo chunk', () => {
    const stream = new PacketStream();
    const out = stream.push(Uint8Array.of(0x20, 0x02, 0, 0, 0xd0, 0x00));
    expect(out.map(p => p.type)).toEqual(['connack', 'pingresp']);
  });
});

describe('backoffDelayMs', () => {
  const noJitter = () => 0.5; // (0.5 * 2 - 1) = 0 → sin jitter
  it('sigue la secuencia 1, 2, 4, 8, 16, 30 s', () => {
    expect([0, 1, 2, 3, 4, 5].map(n => backoffDelayMs(n, noJitter))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000,
    ]);
  });
  it('se mantiene en 30 s como máximo', () => {
    expect(backoffDelayMs(20, noJitter)).toBe(30000);
  });
  it('aplica jitter de ±20 %', () => {
    expect(backoffDelayMs(0, () => 0)).toBe(800);
    expect(backoffDelayMs(0, () => 1)).toBe(1200);
  });
});

describe('parseReading (tolerante)', () => {
  const full = JSON.stringify({
    time: '2026-11-12 16:03:17',
    model: 'Vevor-7in1',
    id: 7907,
    channel: 0,
    battery_ok: 1,
    temperature_C: 21.3,
    humidity: 46,
    wind_avg_km_h: 2.4001,
    wind_max_km_h: 3.2,
    wind_dir_deg: 322,
    rain_mm: 125.12099,
    uvi: 0,
    light_lux: 5695,
    mic: 'CHECKSUM',
  });

  it('parsea el payload de ejemplo del PRD', () => {
    const res = parseReading(full, 1000);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reading.temperatureC).toBe(21.3);
    expect(res.reading.windDirDeg).toBe(322);
    expect(res.reading.micValid).toBe(true);
    expect(res.reading.batteryOk).toBe(true);
    expect(res.unknownFields).toEqual([]);
  });

  it('campos ausentes quedan en null sin romper (CA-04)', () => {
    const res = parseReading(JSON.stringify({ temperature_C: 10 }), 1000);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reading.humidity).toBeNull();
    expect(res.reading.uvi).toBeNull();
    expect(res.reading.temperatureC).toBe(10);
  });

  it('JSON inválido se descarta (CA-03)', () => {
    expect(parseReading('{oops', 1)).toEqual({ ok: false, reason: 'invalid_json' });
  });

  it('arrays y primitivos se descartan', () => {
    expect(parseReading('[1,2]', 1)).toEqual({ ok: false, reason: 'not_object' });
    expect(parseReading('42', 1)).toEqual({ ok: false, reason: 'not_object' });
  });

  it('mensajes gigantes se descartan sin parsear', () => {
    const big = 'x'.repeat(MAX_PAYLOAD_BYTES + 1);
    expect(parseReading(big, 1)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('valores fuera de rango se anulan', () => {
    const res = parseReading(JSON.stringify({ humidity: 250, temperature_C: 999 }), 1);
    if (!res.ok) throw new Error('debería parsear');
    expect(res.reading.humidity).toBeNull();
    expect(res.reading.temperatureC).toBeNull();
  });

  it('mic distinto de CHECKSUM marca la lectura como dudosa (RF-10)', () => {
    const res = parseReading(JSON.stringify({ mic: 'CRC' }), 1);
    if (!res.ok) throw new Error('debería parsear');
    expect(res.reading.micValid).toBe(false);
  });

  it('reporta campos desconocidos sin fallar', () => {
    const res = parseReading(JSON.stringify({ temperature_C: 1, foo: 2 }), 1);
    if (!res.ok) throw new Error('debería parsear');
    expect(res.unknownFields).toEqual(['foo']);
  });

  it('calcula el delta de lluvia respecto a la lectura anterior', () => {
    const res = parseReading(JSON.stringify({ rain_mm: 12 }), 1, 10);
    if (!res.ok) throw new Error('debería parsear');
    expect(res.reading.rainDeltaMm).toBeCloseTo(2);
  });
});

/** Transporte falso que registra lo enviado y permite emitir bytes. */
function fakeTransport() {
  const sent: Uint8Array[] = [];
  const t: Transport & { emit: (b: Uint8Array) => void; failOpen?: boolean; drop: () => void } = {
    kind: 'wss',
    onData: null,
    onClose: null,
    open: jest.fn(async () => {
      if (t.failOpen) throw new Error('boom');
    }),
    send: (b: Uint8Array) => {
      sent.push(b);
    },
    close: jest.fn(),
    emit(b: Uint8Array) {
      this.onData?.(b);
    },
    drop() {
      this.onClose?.('closed');
    },
  };
  return { t, sent };
}

describe('MqttClient', () => {
  function setup(factory: () => Transport) {
    const timers: { fn: () => void; ms: number }[] = [];
    const client = new MqttClient({
      createTransport: factory,
      setTimeoutFn: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => undefined,
      setIntervalFn: () => 1 as unknown as ReturnType<typeof setInterval>,
      clearIntervalFn: () => undefined,
      random: () => 0.5,
    });
    const events: ClientEvent[] = [];
    client.subscribeEvents(e => events.push(e));
    return { client, events, timers };
  }

  const cfg = { clientId: 'c', username: 'toni', password: 'p', topic: 'rtl_433/chuwi/events' };

  it('conecta, envía CONNECT y se suscribe al recibir CONNACK OK', async () => {
    const { t, sent } = fakeTransport();
    const { client, events } = setup(() => t);
    client.start(cfg);
    await flush();
    expect(sent[0][0]).toBe(0x10); // CONNECT
    t.emit(Uint8Array.of(0x20, 0x02, 0x00, 0x00));
    expect(client.getState()).toBe('connected');
    expect(sent.some(b => b[0] === 0x82)).toBe(true); // SUBSCRIBE
    expect(events.some(e => e.type === 'state' && e.state === 'connected')).toBe(true);
  });

  it('CONNACK con error de credenciales deja estado error y no reintenta', async () => {
    const { t } = fakeTransport();
    const { client, timers } = setup(() => t);
    client.start(cfg);
    await flush();
    t.emit(Uint8Array.of(0x20, 0x02, 0x00, 0x04));
    expect(client.getState()).toBe('error');
    expect(timers.length).toBe(0);
  });

  it('pérdida de conexión programa reconexión con backoff', async () => {
    const { t } = fakeTransport();
    const { client, timers } = setup(() => t);
    client.start(cfg);
    await flush();
    t.emit(Uint8Array.of(0x20, 0x02, 0x00, 0x00));
    t.drop();
    expect(client.getState()).toBe('reconnecting');
    expect(timers[0].ms).toBe(1000);
  });

  it('mensajes PUBLISH se emiten como evento message', async () => {
    const { t } = fakeTransport();
    const { client, events } = setup(() => t);
    client.start(cfg);
    await flush();
    t.emit(Uint8Array.of(0x20, 0x02, 0x00, 0x00));
    const topic = enc('rtl_433/chuwi/events');
    const payload = enc('{"temperature_C":1}');
    const body = new Uint8Array([0, topic.length, ...topic, ...payload]);
    t.emit(new Uint8Array([0x30, body.length, ...body]));
    expect(events).toContainEqual({
      type: 'message',
      topic: 'rtl_433/chuwi/events',
      payload: '{"temperature_C":1}',
    });
  });
});
