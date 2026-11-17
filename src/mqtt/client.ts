import {
  encodeConnect,
  encodeDisconnect,
  encodePingReq,
  encodeSubscribe,
  nextPacketId,
  PacketStream,
  type Packet,
} from '@/mqtt/codec';
import type { Transport } from '@/mqtt/transport';
import type { ConnectionState } from '@/types/weather';

/** Backoff de reconexión en segundos (PRD RF-04). */
export const BACKOFF_STEPS_SEC = [1, 2, 4, 8, 16, 30] as const;
export const JITTER_RATIO = 0.2;
export const KEEPALIVE_SEC = 60; // RF-05: CONNECT keepalive
export const PING_INTERVAL_MS = 20_000; // PRD §9.2: ping cada 20 s

/** Calcula el retardo de reconexión para el intento `attempt` (0-based), con jitter ±20 %. */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const index = Math.min(attempt, BACKOFF_STEPS_SEC.length - 1);
  const base = BACKOFF_STEPS_SEC[index] * 1000;
  const jitter = (random() * 2 - 1) * JITTER_RATIO * base;
  return Math.round(base + jitter);
}

export interface MqttConfig {
  clientId: string;
  username: string;
  password: string;
  topic: string;
}

export interface MqttClientDeps {
  createTransport: () => Transport;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
  setIntervalFn?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (id: ReturnType<typeof setInterval>) => void;
  random?: () => number;
}

export type ClientEvent =
  | { type: 'state'; state: ConnectionState; detail?: string }
  | { type: 'message'; topic: string; payload: string }
  | { type: 'log'; message: string };

export type ClientListener = (event: ClientEvent) => void;

/** Códigos CONNACK (MQTT 3.1.1, §3.2.2.3). */
const CONNACK_MESSAGES: Record<number, string> = {
  1: 'Versión de protocolo no soportada',
  2: 'Identificador de cliente rechazado',
  3: 'Servidor no disponible',
  4: 'Usuario o contraseña incorrectos',
  5: 'No autorizado',
};

/**
 * Cliente MQTT 3.1.1 con QoS 0 (PRD RF-01..RF-08).
 * Gestiona autenticación, suscripción, keepalive y reconexión con backoff exponencial.
 */
export class MqttClient {
  private transport: Transport | null = null;
  private stream = new PacketStream();
  private config: MqttConfig | null = null;
  private state: ConnectionState = 'idle';
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private listeners = new Set<ClientListener>();
  private readonly deps: Required<Omit<MqttClientDeps, 'createTransport'>> & Pick<MqttClientDeps, 'createTransport'>;

  constructor(deps: MqttClientDeps) {
    this.deps = {
      setTimeoutFn: deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimeoutFn: deps.clearTimeoutFn ?? (id => clearTimeout(id)),
      setIntervalFn: deps.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms)),
      clearIntervalFn: deps.clearIntervalFn ?? (id => clearInterval(id)),
      random: deps.random ?? Math.random,
      createTransport: deps.createTransport,
    };
  }

  subscribeEvents(listener: ClientListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): ConnectionState {
    return this.state;
  }

  /** Inicia la conexión. Si ya estaba activa, la reinicia. */
  start(config: MqttConfig): void {
    this.config = config;
    this.stopped = false;
    this.attempt = 0;
    this.clearReconnect();
    this.teardownTransport();
    void this.connect();
  }

  /** Cierra la conexión y deja de reconectar. */
  stop(): void {
    this.stopped = true;
    this.clearReconnect();
    if (this.transport) {
      try {
        this.transport.send(encodeDisconnect());
      } catch {
        // ignorar: el socket puede estar ya cerrado
      }
    }
    this.teardownTransport();
    this.setState('idle');
  }

  /** Reconexión manual inmediata (RF-06). */
  reconnectNow(): void {
    if (!this.config) return;
    this.stopped = false;
    this.attempt = 0;
    this.clearReconnect();
    this.teardownTransport();
    void this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.config || this.stopped) return;
    const config = this.config;
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');

    const transport = this.deps.createTransport();
    this.transport = transport;
    this.stream = new PacketStream();

    transport.onData = bytes => this.handleBytes(bytes);
    transport.onClose = reason => this.handleClose(transport, reason);

    try {
      await transport.open();
      if (this.transport !== transport || this.stopped) return;
      transport.send(
        encodeConnect({
          clientId: config.clientId,
          username: config.username || undefined,
          password: config.password || undefined,
          keepAliveSec: KEEPALIVE_SEC,
          cleanSession: true,
        })
      );
      this.emit({ type: 'log', message: `CONNECT enviado (${transport.kind}, clientId ${config.clientId})` });
    } catch (err) {
      if (this.transport !== transport) return;
      this.teardownTransport();
      this.handleFailure(err instanceof Error ? err.message : 'Error de conexión');
    }
  }

  private handleBytes(bytes: Uint8Array): void {
    let packets: Packet[];
    try {
      packets = this.stream.push(bytes);
    } catch {
      return;
    }
    for (const packet of packets) this.handlePacket(packet);
  }

  private handlePacket(packet: Packet): void {
    switch (packet.type) {
      case 'connack': {
        if (packet.returnCode !== 0) {
          const msg = CONNACK_MESSAGES[packet.returnCode] ?? `Código CONNACK ${packet.returnCode}`;
          this.emit({ type: 'log', message: `CONNACK rechazado: ${msg}` });
          this.stopped = true; // credenciales o configuración erróneas: no reintentar en bucle
          this.teardownTransport();
          this.setState('error', msg);
          return;
        }
        this.attempt = 0;
        this.setState('connected');
        this.startPing();
        this.subscribe();
        return;
      }
      case 'suback':
        this.emit({ type: 'log', message: `SUBACK recibido (${packet.returnCodes.join(',')})` });
        return;
      case 'publish':
        if (packet.qos === 1 && packet.packetId !== undefined) {
          // PUBACK para QoS 1 (solo lectura; el cliente se suscribe con QoS 0).
          this.transport?.send(Uint8Array.of(0x40, 0x02, packet.packetId >> 8, packet.packetId & 0xff));
        }
        this.emit({ type: 'message', topic: packet.topic, payload: packet.payload });
        return;
      default:
        return;
    }
  }

  private subscribe(): void {
    if (!this.transport || !this.config) return;
    this.transport.send(encodeSubscribe(this.config.topic, 0, nextPacketId()));
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = this.deps.setIntervalFn(() => {
      try {
        this.transport?.send(encodePingReq());
      } catch {
        this.handleClose(this.transport, 'ping fallido');
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      this.deps.clearIntervalFn(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private handleClose(transport: Transport | null, reason: string): void {
    if (!transport || transport !== this.transport) return;
    this.teardownTransport();
    if (this.stopped) return;
    this.handleFailure(reason || 'Conexión cerrada');
  }

  private handleFailure(detail: string): void {
    if (this.stopped) return;
    const delay = backoffDelayMs(this.attempt, this.deps.random);
    this.attempt += 1;
    this.setState('reconnecting', detail);
    this.emit({ type: 'log', message: `Reconexión en ${Math.round(delay / 1000)} s (${detail})` });
    this.reconnectTimer = this.deps.setTimeoutFn(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private teardownTransport(): void {
    this.stopPing();
    const t = this.transport;
    this.transport = null;
    if (t) {
      t.onData = null;
      t.onClose = null;
      t.close();
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      this.deps.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(state: ConnectionState, detail?: string): void {
    this.state = state;
    this.emit({ type: 'state', state, detail });
  }

  private emit(event: ClientEvent): void {
    for (const l of this.listeners) l(event);
  }
}
