/**
 * Shared serialization for session items stored in CellData.text.
 *
 * Each line in CellData.text is a single session item. The optional prefix
 * `[meta] text` carries metadata that survives the existing newline-based
 * storage without a schema migration.
 *
 * Meta grammar (all parts optional, separated by `|`):
 *   - `#RRGGBB`             — chosen color
 *   - `H:MM` or `HH:MM`     — start time of day (24h)
 *   - `Nm`                  — duration in minutes (e.g. `90m`)
 *
 * Examples:
 *   "[#E63337] Intervaller"
 *   "[#26B270|07:30|45m] Morgenløp"
 *   "[06:00|60m] Yoga"
 */

export interface SessionMeta {
  color: string | null;
  /** Minutes since 00:00 (0..1440) or null if unscheduled. */
  startMin: number | null;
  /** Duration in minutes or null if unspecified. */
  durationMin: number | null;
  text: string;
}

const META_RE = /^\[([^\]]*)\]\s*/;

export function parseSession(raw: string): SessionMeta {
  const m = raw.match(META_RE);
  if (!m) {
    return { color: null, startMin: null, durationMin: null, text: raw };
  }
  const body = m[1];
  const text = raw.slice(m[0].length);
  let color: string | null = null;
  let startMin: number | null = null;
  let durationMin: number | null = null;
  for (const part of body.split("|")) {
    const p = part.trim();
    if (!p) continue;
    if (/^#[0-9a-fA-F]{6}$/.test(p)) {
      color = p;
    } else if (/^\d{1,2}:\d{2}$/.test(p)) {
      const [h, mm] = p.split(":").map((n) => parseInt(n, 10));
      if (h >= 0 && h <= 24 && mm >= 0 && mm < 60) startMin = h * 60 + mm;
    } else if (/^\d+m$/i.test(p)) {
      durationMin = parseInt(p, 10);
    }
  }
  return { color, startMin, durationMin, text };
}

export function formatSession(meta: Partial<SessionMeta> & { text: string }): string {
  const parts: string[] = [];
  if (meta.color) parts.push(meta.color);
  if (meta.startMin != null) {
    const h = Math.floor(meta.startMin / 60);
    const mm = meta.startMin % 60;
    parts.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  if (meta.durationMin != null) parts.push(`${meta.durationMin}m`);
  if (parts.length === 0) return meta.text;
  return `[${parts.join("|")}] ${meta.text}`;
}

export function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}t` : `${h}t ${m}min`;
}
