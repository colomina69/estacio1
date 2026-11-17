import type { TransportKind } from '@/types/weather';

/** Transporte de bytes. Implementaciones: WebSocket (Expo Go) y TCP (development build). */
export interface Transport {
  readonly kind: TransportKind;
  open(): Promise<void>;
  send(bytes: Uint8Array): void;
  close(): void;
  onData: ((bytes: Uint8Array) => void) | null;
  onClose: ((reason: string) => void) | null;
}

export interface WssOptions {
  url: string;
}

export interface TcpOptions {
  host: string;
  port: number;
}

/**
 * MQTT sobre WebSocket con TLS (`wss://`). Usa el WebSocket global de React Native con subprotocolo `mqtt`.
 * Funciona en Expo Go (PRD §9.2, punto 1).
 */
export class WebSocketTransport implements Transport {
  readonly kind = 'wss' as const;
  onData: ((bytes: Uint8Array) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  private socket: WebSocket | null = null;

  constructor(private readonly opts: WssOptions) {}

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.opts.url, ['mqtt']);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('No se pudo crear el WebSocket'));
        return;
      }
      ws.binaryType = 'arraybuffer';
      this.socket = ws;

      ws.onopen = () => {
        settled = true;
        resolve();
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Error de WebSocket'));
        }
      };
      ws.onclose = event => {
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket cerrado antes de conectar'));
        }
        this.socket = null;
        this.onClose?.(event.reason || 'closed');
      };
      ws.onmessage = event => {
        const data = event.data;
        if (data instanceof ArrayBuffer) {
          this.onData?.(new Uint8Array(data));
        }
      };
    });
  }

  send(bytes: Uint8Array): void {
    if (!this.socket) throw new Error('Transporte no conectado');
    this.socket.send(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  }

  close(): void {
    const ws = this.socket;
    this.socket = null;
    ws?.close();
  }
}

type TcpModule = {
  createConnection: (
    options: { host: string; port: number; tls: boolean },
    listener?: () => void
  ) => TcpSocketLike;
};

interface TcpSocketLike {
  on(event: 'data', cb: (data: Uint8Array | string) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'close', cb: (hadError: boolean) => void): void;
  on(event: 'connect', cb: () => void): void;
  write(data: Uint8Array): void;
  destroy(): void;
}

/**
 * MQTT sobre TCP (1883, sin TLS). Requiere development build porque usa `react-native-tcp-socket`.
 * Se carga de forma diferida para no romper Expo Go (PRD §9.2, punto 2).
 */
export class TcpTransport implements Transport {
  readonly kind = 'tcp' as const;
  onData: ((bytes: Uint8Array) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  private socket: TcpSocketLike | null = null;

  constructor(private readonly opts: TcpOptions) {}

  static isAvailable(): boolean {
    try {
      loadTcpModule();
      return true;
    } catch {
      return false;
    }
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let mod: TcpModule;
      try {
        mod = loadTcpModule();
      } catch {
        reject(new Error('TCP no disponible en Expo Go. Usa WSS o una development build.'));
        return;
      }
      const socket = mod.createConnection({ host: this.opts.host, port: this.opts.port, tls: false }, () => {
        settled = true;
        resolve();
      });
      this.socket = socket;

      socket.on('data', data => {
        if (typeof data === 'string') return;
        this.onData?.(data);
      });
      socket.on('error', err => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      socket.on('close', () => {
        if (!settled) {
          settled = true;
          reject(new Error('Conexión TCP cerrada antes de conectar'));
        }
        this.socket = null;
        this.onClose?.('closed');
      });
    });
  }

  send(bytes: Uint8Array): void {
    if (!this.socket) throw new Error('Transporte no conectado');
    this.socket.write(bytes);
  }

  close(): void {
    const s = this.socket;
    this.socket = null;
    s?.destroy();
  }
}

function loadTcpModule(): TcpModule {
  // require diferido: si el módulo nativo no está presente (Expo Go), lanza y lo capturamos arriba.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-tcp-socket') as { default?: TcpModule } & TcpModule;
  return mod.default ?? mod;
}
