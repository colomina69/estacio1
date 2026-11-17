const STATION_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/**
 * Parsea `YYYY-MM-DD HH:mm:ss` como hora local del dispositivo (PRD Q-02, riesgo de zona horaria).
 * Devuelve null si el formato no es válido o la fecha no existe.
 */
export function parseStationTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = STATION_TIME.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date.getTime();
}

export function startOfTodayMs(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const pad = (n: number) => n.toString().padStart(2, '0');

/** Formato visible `DD-MM-AAAA HH:mm` (PRD §9.3). */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Hora corta `HH:mm`, o `DD-MM HH:mm` si el instante es de otro día. */
export function formatTimeOrDay(ms: number, now: number = Date.now()): string {
  const d = new Date(ms);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return startOfTodayMs(now) === startOfTodayMs(ms) ? hm : `${pad(d.getDate())}-${pad(d.getMonth() + 1)} ${hm}`;
}

/** Texto relativo en español: "hace 12 s", "hace 3 min", "hace 2 h". */
export function formatAgo(ms: number | null, now: number = Date.now()): string {
  if (ms === null) return 'sin datos';
  const sec = Math.max(0, Math.round((now - ms) / 1000));
  if (sec < 60) return `hace ${sec} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return `hace ${h} h`;
}
