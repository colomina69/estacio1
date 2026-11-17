import { applyCooldown, evaluateThresholds, isConnectionLost } from '@/alerts/evaluate';
import { sendLocalAlert } from '@/alerts/notifications';
import { MQTT_CLIENT_ID_PREFIX, STALE_AFTER_MS } from '@/config/defaults';
import { insertAlert, insertReading, lastRainMm, purgeOlderThan, rainTodayMm } from '@/db/database';
import { MqttClient, type ClientEvent } from '@/mqtt/client';
import { parseReading } from '@/mqtt/parser';
import { TcpTransport, WebSocketTransport, type Transport } from '@/mqtt/transport';
import { startOfTodayMs } from '@/lib/time';
import { loadSecrets, seedDevInfluxToken } from '@/store/secrets';
import { useSettingsStore } from '@/store/settingsStore';
import { useWeatherStore } from '@/store/weatherStore';
import type { AlertEvent, Settings } from '@/types/weather';

const STALE_CHECK_MS = 15_000;

/**
 * Crea la fábrica de transporte. En Expo Go (sin módulo nativo) TCP se fuerza a WSS (PRD §9.2, punto 5).
 */
export function transportFactory(settings: Settings): () => Transport {
  return () => {
    if (settings.transport === 'tcp' && TcpTransport.isAvailable()) {
      return new TcpTransport({ host: settings.host, port: settings.port });
    }
    return new WebSocketTransport({ url: settings.wssUrl });
  };
}

/**
 * Une cliente MQTT, SQLite, stores y alertas (PRD §9.4 `stationService`).
 * Es el único punto que procesa los mensajes entrantes.
 */
export class StationService {
  private client: MqttClient | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private running = false;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await seedDevInfluxToken();
    const settings = useSettingsStore.getState();
    const secrets = await loadSecrets();
    await purgeOlderThan(settings.retentionDays);

    const store = useWeatherStore.getState();
    store.resetSession();

    this.client = new MqttClient({ createTransport: transportFactory(settings) });
    this.unsubscribe = this.client.subscribeEvents(event => this.onClientEvent(event));
    this.client.start({
      clientId: `${MQTT_CLIENT_ID_PREFIX}${randomSuffix()}`,
      username: settings.username,
      password: secrets.mqttPassword,
      topic: settings.topic,
    });

    this.staleTimer = setInterval(() => this.checkStale(), STALE_CHECK_MS);
  }

  stop(): void {
    this.running = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = null;
    this.client?.stop();
    this.client = null;
  }

  /** Reaplica ajustes y secretos actuales (p. ej. contraseña nueva) y reconecta desde cero. */
  async reconnect(): Promise<void> {
    this.stop();
    await this.start();
  }

  private onClientEvent(event: ClientEvent): void {
    const store = useWeatherStore.getState();
    switch (event.type) {
      case 'state':
        store.setConnection(event.state, event.detail ?? null);
        return;
      case 'log':
        store.addLog(event.message);
        return;
      case 'message':
        void this.onMessage(event.payload);
        return;
    }
  }

  private async onMessage(payload: string): Promise<void> {
    const store = useWeatherStore.getState();
    const now = Date.now();
    const previousRain = store.latest?.rainMm ?? (await lastRainMm());
    const result = parseReading(payload, now, previousRain);

    if (!result.ok) {
      store.incrementDiscarded();
      store.addLog(`Mensaje descartado: ${result.reason}`, now);
      return;
    }
    if (result.unknownFields.length > 0) {
      store.addLog(`Campos desconocidos: ${result.unknownFields.join(', ')}`, now);
    }

    const { reading } = result;
    try {
      await insertReading(reading);
    } catch (err) {
      store.addLog(`Error al guardar lectura: ${err instanceof Error ? err.message : 'desconocido'}`, now);
    }

    const rainToday = await rainTodayMm(startOfTodayMs(now));
    useWeatherStore.getState().setLatest(reading, rainToday);
    await this.dispatchAlerts(
      evaluateThresholds({ reading, thresholds: useSettingsStore.getState().thresholds }),
      now
    );
  }

  private async dispatchAlerts(candidates: AlertEvent[], now: number): Promise<void> {
    const { alertCooldownMin } = useSettingsStore.getState();
    const store = useWeatherStore.getState();
    const due = applyCooldown(candidates, store.lastAlertAt, now, alertCooldownMin);
    for (const event of due) {
      store.markAlertFired(event.type, now);
      try {
        await insertAlert(event, now);
      } catch {
        // el registro local es best-effort; la notificación se envía igualmente
      }
      await sendLocalAlert(event);
    }
  }

  /** Dato obsoleto (RF-08) y pérdida de conexión como alerta (RF-25). */
  private checkStale(): void {
    const store = useWeatherStore.getState();
    const { thresholds } = useSettingsStore.getState();
    const now = Date.now();
    if (!thresholds.connectionLost || store.connection !== 'connected') return;
    if (!isConnectionLost(store.lastMessageAt, now, STALE_AFTER_MS)) return;
    void this.dispatchAlerts(
      [
        {
          type: 'connection_lost',
          value: null,
          threshold: STALE_AFTER_MS / 60_000,
          message: 'La estación no publica datos desde hace más de 5 minutos',
        },
      ],
      now
    );
  }
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

let instance: StationService | null = null;

export function getStationService(): StationService {
  if (!instance) instance = new StationService();
  return instance;
}
