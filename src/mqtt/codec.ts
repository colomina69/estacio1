/**
 * Codec MQTT 3.1.1 mínimo (PRD §9.2): CONNECT, CONNACK, SUBSCRIBE, SUBACK, PUBLISH (QoS 0/1 lectura), PINGREQ/PINGRESP.
 * Sin dependencias de Node: solo Uint8Array y TextEncoder/TextDecoder.
 */

export const PacketType = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  SUBSCRIBE: 8,
  SUBACK: 9,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
} as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

/** Longitud máxima de un paquete aceptado (límite de la especificación: 268 435 455). */
export const MAX_REMAINING_LENGTH = 268_435_455;

export function encodeString(value: string): Uint8Array {
  const bytes = encoder.encode(value);
  if (bytes.length > 0xffff) throw new Error('MQTT string demasiado larga');
  const out = new Uint8Array(2 + bytes.length);
  out[0] = (bytes.length >> 8) & 0xff;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  return out;
}

export function encodeRemainingLength(length: number): number[] {
  if (length < 0 || length > MAX_REMAINING_LENGTH) throw new Error('Longitud MQTT fuera de rango');
  const out: number[] = [];
  let x = length;
  do {
    let byte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) byte |= 0x80;
    out.push(byte);
  } while (x > 0);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function packet(header: number, body: Uint8Array): Uint8Array {
  const rl = Uint8Array.from(encodeRemainingLength(body.length));
  return concat([Uint8Array.of(header), rl, body]);
}

export interface ConnectOptions {
  clientId: string;
  username?: string;
  password?: string;
  keepAliveSec: number;
  cleanSession: boolean;
}

export function encodeConnect(opts: ConnectOptions): Uint8Array {
  let flags = 0;
  if (opts.cleanSession) flags |= 0x02;
  const parts: Uint8Array[] = [
    encodeString('MQTT'),
    Uint8Array.of(0x04), // protocol level 3.1.1
  ];
  if (opts.username) flags |= 0x80;
  if (opts.password) flags |= 0x40;
  parts.push(Uint8Array.of(flags, (opts.keepAliveSec >> 8) & 0xff, opts.keepAliveSec & 0xff));
  parts.push(encodeString(opts.clientId));
  if (opts.username) parts.push(encodeString(opts.username));
  if (opts.password) parts.push(encodeString(opts.password));
  return packet(0x10, concat(parts));
}

let packetIdCounter = 0;
export function nextPacketId(): number {
  packetIdCounter = (packetIdCounter % 0xffff) + 1;
  return packetIdCounter;
}

export function encodeSubscribe(topic: string, qos: 0 | 1 = 0, packetId = nextPacketId()): Uint8Array {
  const body = concat([
    Uint8Array.of((packetId >> 8) & 0xff, packetId & 0xff),
    encodeString(topic),
    Uint8Array.of(qos),
  ]);
  return packet(0x82, body);
}

export function encodePingReq(): Uint8Array {
  return Uint8Array.of(0xc0, 0x00);
}

export function encodeDisconnect(): Uint8Array {
  return Uint8Array.of(0xe0, 0x00);
}

export type Packet =
  | { type: 'connack'; sessionPresent: boolean; returnCode: number }
  | { type: 'suback'; packetId: number; returnCodes: number[] }
  | { type: 'publish'; topic: string; payload: string; qos: number; packetId?: number }
  | { type: 'puback'; packetId: number }
  | { type: 'pingresp' }
  | { type: 'unknown'; packetType: number };

export class IncompletePacket extends Error {}

/** Lee la longitud restante. Lanza IncompletePacket si faltan bytes. */
function readRemainingLength(buf: Uint8Array, start: number): { value: number; bytes: number } {
  let multiplier = 1;
  let value = 0;
  let i = start;
  for (let n = 0; n < 4; n++) {
    if (i >= buf.length) throw new IncompletePacket();
    const byte = buf[i++];
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return { value, bytes: i - start };
    multiplier *= 128;
  }
  throw new Error('Longitud restante MQTT inválida');
}

/**
 * Decodifica un único paquete al inicio de `buf`.
 * Devuelve el paquete y los bytes consumidos. Lanza IncompletePacket si aún no llegó completo.
 */
export function decodePacket(buf: Uint8Array): { packet: Packet; consumed: number } {
  if (buf.length < 2) throw new IncompletePacket();
  const header = buf[0];
  const type = header >> 4;
  const flags = header & 0x0f;
  const { value: remaining, bytes: rlBytes } = readRemainingLength(buf, 1);
  const headerLen = 1 + rlBytes;
  if (buf.length < headerLen + remaining) throw new IncompletePacket();
  const body = buf.subarray(headerLen, headerLen + remaining);
  const consumed = headerLen + remaining;

  switch (type) {
    case PacketType.CONNACK:
      return {
        packet: { type: 'connack', sessionPresent: (body[0] & 0x01) === 1, returnCode: body[1] },
        consumed,
      };
    case PacketType.SUBACK: {
      const packetId = (body[0] << 8) | body[1];
      return {
        packet: { type: 'suback', packetId, returnCodes: Array.from(body.subarray(2)) },
        consumed,
      };
    }
    case PacketType.PUBLISH: {
      const qos = (flags >> 1) & 0x03;
      const topicLen = (body[0] << 8) | body[1];
      const topic = decoder.decode(body.subarray(2, 2 + topicLen));
      let offset = 2 + topicLen;
      let packetId: number | undefined;
      if (qos > 0) {
        packetId = (body[offset] << 8) | body[offset + 1];
        offset += 2;
      }
      const payload = decoder.decode(body.subarray(offset));
      return { packet: { type: 'publish', topic, payload, qos, packetId }, consumed };
    }
    case PacketType.PUBACK:
      return {
        packet: { type: 'puback', packetId: (body[0] << 8) | body[1] },
        consumed,
      };
    case PacketType.PINGRESP:
      return { packet: { type: 'pingresp' }, consumed };
    default:
      return { packet: { type: 'unknown', packetType: type }, consumed };
  }
}

/**
 * Acumula bytes del socket y extrae paquetes completos.
 * Si un paquete no es decodificable, descarta el buffer para no quedar bloqueado.
 */
export class PacketStream {
  private buffer: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): Packet[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;

    const out: Packet[] = [];
    while (this.buffer.length > 0) {
      try {
        const { packet, consumed } = decodePacket(this.buffer);
        out.push(packet);
        this.buffer = this.buffer.subarray(consumed);
      } catch (err) {
        if (err instanceof IncompletePacket) break;
        this.buffer = new Uint8Array(0);
        break;
      }
    }
    return out;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }
}
