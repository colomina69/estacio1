import { create } from 'zustand';

import type { AlertType, ConnectionState, Reading } from '@/types/weather';

export interface LogEntry {
  at: number;
  message: string;
}

export interface Diagnostics {
  received: number;
  discarded: number;
  reconnects: number;
  sessionStartedAt: number | null;
}

export interface WeatherState {
  connection: ConnectionState;
  connectionDetail: string | null;
  latest: Reading | null;
  lastMessageAt: number | null;
  lastAlertAt: Partial<Record<AlertType, number>>;
  rainTodayMm: number;
  logs: LogEntry[];
  diagnostics: Diagnostics;
  setConnection: (state: ConnectionState, detail?: string | null) => void;
  setLatest: (reading: Reading, rainToday: number) => void;
  markAlertFired: (type: AlertType, at: number) => void;
  addLog: (message: string, at?: number) => void;
  incrementDiscarded: () => void;
  resetSession: () => void;
}

const MAX_LOGS = 200;

const emptyDiagnostics = (): Diagnostics => ({
  received: 0,
  discarded: 0,
  reconnects: 0,
  sessionStartedAt: null,
});

/**
 * Estado en vivo (PRD §9.4 `weatherStore`). No persiste: la última lectura se recupera desde SQLite al arrancar.
 */
export const useWeatherStore = create<WeatherState>((set, get) => ({
  connection: 'idle',
  connectionDetail: null,
  latest: null,
  lastMessageAt: null,
  lastAlertAt: {},
  rainTodayMm: 0,
  logs: [],
  diagnostics: emptyDiagnostics(),

  setConnection: (state, detail = null) => {
    const prev = get().connection;
    const reconnects =
      state === 'reconnecting' && prev !== 'reconnecting'
        ? get().diagnostics.reconnects + 1
        : get().diagnostics.reconnects;
    const sessionStartedAt =
      state === 'connected' && prev !== 'connected'
        ? Date.now()
        : get().diagnostics.sessionStartedAt;
    set({
      connection: state,
      connectionDetail: detail,
      diagnostics: { ...get().diagnostics, reconnects, sessionStartedAt },
    });
  },

  setLatest: (reading, rainToday) =>
    set(s => ({
      latest: reading,
      lastMessageAt: reading.receivedAt,
      rainTodayMm: rainToday,
      diagnostics: { ...s.diagnostics, received: s.diagnostics.received + 1 },
    })),

  markAlertFired: (type, at) =>
    set(s => ({ lastAlertAt: { ...s.lastAlertAt, [type]: at } })),

  addLog: (message, at = Date.now()) =>
    set(s => ({ logs: [{ at, message }, ...s.logs].slice(0, MAX_LOGS) })),

  incrementDiscarded: () =>
    set(s => ({ diagnostics: { ...s.diagnostics, discarded: s.diagnostics.discarded + 1 } })),

  resetSession: () => set({ diagnostics: emptyDiagnostics(), logs: [] }),
}));
