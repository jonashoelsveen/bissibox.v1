/**
 * Calendar import parser — Bielsys/timeplan CSV + Excel.
 *
 * Produces wall-clock local ISO timestamps (no Z) matching the calendar
 * store convention. Room/organizer land in `description` (no DB columns).
 */

import * as XLSX from "xlsx";

export type ImportedSession = {
  title: string;
  /** Raw Bielsys `teaching-title` (when present). */
  teachingTitle?: string;
  /** Raw Bielsys `summary` (when present). */
  summary?: string;
  startISO: string;
  endISO: string;
  allDay: false;
  /** Always set — mapped from file category variation onto our palette. */
  color: string;
  /** Room label from the Room column (Bielsys: "Building Nickname"). */
  location?: string;
  /** Full last room segment for MazeMap (Bielsys only), e.g. "Realfagbygget R1". */
  locationFull?: string;
  /** Resolved MazeMap deep link (filled by import-preview for Bielsys). */
  locationUrl?: string;
  description?: string;
  source?: {
    courseid?: string;
    eventid?: string;
    colorKey?: string;
  };
};

export type ImportFileProfile = "bielsys" | "generic";

export type ParseImportResult = {
  sessions: ImportedSession[];
  skipped: number;
  warnings: string[];
  profile: ImportFileProfile;
};

const pad = (n: number) => String(n).padStart(2, "0");

function toLocalISO(y: number, mo: number, d: number, h: number, mi: number): string {
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00`;
}

/** Parse Bielsys-style and ISO-ish datetime strings into local ISO. */
export function parseImportDateTime(raw: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, "").replace(/\s+/g, " ");
  if (!s) return null;

  // DD.MM.YYYY HH:mm  or  DD.MM.YYYY HH:mm:ss
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    const h = Number(m[4] ?? 0);
    const mi = Number(m[5] ?? 0);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return toLocalISO(y, mo, d, h, mi);
  }

  // YYYY-MM-DD HH:mm  or  YYYY-MM-DDTHH:mm(:ss)
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const h = Number(m[4] ?? 0);
    const mi = Number(m[5] ?? 0);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return toLocalISO(y, mo, d, h, mi);
  }

  return null;
}

function canonicalizeHeader(h: string): string {
  return h
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    // hyphen, en/em dash, minus, underscore, spaces → _
    .replace(/[\s\-_–—−]+/g, "_")
    .replace(/_+/g, "_");
}

const TITLE_ALIASES = new Set(["summary", "teaching_title", "subject", "title"]);
const START_ALIASES = new Set(["dtstart", "start", "starts_at", "start_time", "begin"]);
const END_ALIASES = new Set(["dtend", "end", "ends_at", "end_time", "finish"]);
const LOCATION_ALIASES = new Set(["room", "location", "venue"]);
const ORGANIZER_ALIASES = new Set(["staffnames", "staffs", "organizer", "teacher", "lecturer"]);
const COURSE_ALIASES = new Set(["courseid", "course_id", "course"]);
const EVENT_ALIASES = new Set(["eventid", "event_id", "id"]);

/** App calendar defaults + GroupColorPicker palette — never leave sessions blank.
 * Avoid exact matches with admin sidenav colors (meeting/event/race) so imported
 * sessions are not hidden by admin category filters after confirm. */
export const IMPORT_COLOR_PALETTE = [
  "#ADD8E6", // School (light blue) — primary for timeplan imports
  "#B8B8FF", // Training (periwinkle)
  "#C19A6B", // Work (camel)
  "#FF6B6B", // Coral red (not admin meeting #E63337)
  "#FFB347", // Soft orange (not admin event #F09B0A)
  "#FFCD33", // Golden Yellow
  "#3DDC97", // Mint green (not admin race #26B270)
  "#17A4E0", // Sky Blue
  "#1960C4", // Royal Blue
  "#A22CC8", // Purple
  "#D22551", // Magenta
] as const;

/** Hexes reserved by admin sidenav tabs — must not be used for uncategorized imports. */
const ADMIN_RESERVED_COLORS = new Set([
  "#e63337", // meeting
  "#f09b0a", // event
  "#26b270", // race
]);

const DEFAULT_IMPORT_COLOR = IMPORT_COLOR_PALETTE[0];

type NormalizedRow = {
  title?: string;
  teaching_title?: string;
  summary?: string;
  subject?: string;
  start?: string;
  end?: string;
  location?: string;
  organizer?: string;
  courseid?: string;
  eventid?: string;
  teaching_method?: string;
  teaching_method_name?: string;
  /** Explicit hex from file, if present. */
  colorHex?: string;
  colorKey?: string;
  /** Raw room column before short-name extraction. */
  room?: string;
};

/** Map raw header/value pairs onto a stable internal shape. */
export function smartNormalizeRow(raw: Record<string, unknown>): NormalizedRow {
  const out: NormalizedRow = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    const str = String(value).trim();
    if (!str) continue;
    const k = canonicalizeHeader(key);

    if (TITLE_ALIASES.has(k)) {
      if (k === "summary") out.summary = str;
      else if (k === "teaching_title") out.teaching_title = str;
      else if (k === "subject") out.subject = str;
      else if (k === "title") out.title = str;
      // teaching_title also drives color variation when present
      if (k === "teaching_title" && !out.colorKey) out.colorKey = str;
      continue;
    }
    if (START_ALIASES.has(k)) {
      out.start = str;
      continue;
    }
    if (END_ALIASES.has(k)) {
      out.end = str;
      continue;
    }
    if (LOCATION_ALIASES.has(k)) {
      out.location = str;
      out.room = str;
      continue;
    }
    if (ORGANIZER_ALIASES.has(k)) {
      // Prefer staffnames over staffs when both appear
      if (k === "staffnames" || !out.organizer) out.organizer = str;
      continue;
    }
    if (COURSE_ALIASES.has(k)) {
      out.courseid = str;
      continue;
    }
    if (k === "teaching_method" || k === "teachingmethod") {
      out.teaching_method = str;
      continue;
    }
    if (k === "teaching_method_name") {
      out.teaching_method_name = str;
      continue;
    }
    if (k === "color" || k === "colour") {
      const hex = normalizeColorHex(str);
      if (hex) out.colorHex = hex;
      else if (!out.colorKey) out.colorKey = str;
      continue;
    }
    if (k === "category" && !out.colorKey) {
      out.colorKey = str;
      continue;
    }
    if (EVENT_ALIASES.has(k) && k !== "id") {
      out.eventid = str;
      continue;
    }
    if (k === "id" && !out.eventid) out.eventid = str;
  }

  // Prefer richer Bielsys variation keys when title-based key wasn't set
  if (!out.colorKey) {
    out.colorKey =
      out.teaching_title ||
      out.teaching_method_name ||
      out.teaching_method ||
      out.courseid ||
      out.subject ||
      undefined;
  }

  return out;
}

function normalizeColorHex(raw: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(raw.trim());
  if (!m) return null;
  return `#${m[1].toUpperCase()}`;
}

/** Stable palette index from a category key (same key → same colour). */
export function importColorForKey(key: string): string {
  const k = key.trim().toLowerCase();
  if (!k) return DEFAULT_IMPORT_COLOR;
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) {
    h ^= k.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let color = IMPORT_COLOR_PALETTE[Math.abs(h) % IMPORT_COLOR_PALETTE.length];
  // Defensive: never emit an admin-reserved hex (would vanish behind admin tabs).
  if (ADMIN_RESERVED_COLORS.has(color.toLowerCase())) {
    color = DEFAULT_IMPORT_COLOR;
  }
  return color;
}

/** Compose tile title: teaching_title then summary, e.g. "Fellesøving Parallell 1". */
export function composeImportSessionTitle(
  teachingTitle?: string | null,
  summary?: string | null,
  fallback?: string | null,
): string {
  const teaching = (teachingTitle ?? "").trim();
  const sum = (summary ?? "").trim();
  if (teaching && sum) {
    if (teaching.toLowerCase() === sum.toLowerCase()) return teaching;
    // Summary already starts with teaching title → keep summary only
    if (sum.toLowerCase().startsWith(teaching.toLowerCase())) return sum;
    return `${teaching} ${sum}`;
  }
  return (teaching || sum || fallback || "").trim();
}

function resolveSessionColor(n: NormalizedRow): string {
  if (n.colorHex) return n.colorHex;
  return importColorForKey(n.colorKey || n.teaching_title || n.courseid || "default");
}

/**
 * Parse Bielsys "Building: Room" entries. Buildings may contain commas
 * (`IT-bygget, sydfløy: F1`); only split when a new `…: …` entry begins.
 */
export type RoomEntry = { building: string; name: string };

export function parseRoomEntries(room: string): RoomEntry[] {
  const raw = room.trim();
  if (!raw) return [];

  // Each entry: building (may include commas) + ":" + room name until the next
  // ", Building:" boundary or end of string.
  const re = /(.+?):\s*(.+?)(?=,\s*[^,][^:]*:|$)/gs;
  const out: RoomEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const building = m[1].replace(/^,\s*/, "").trim();
    const name = m[2].trim();
    if (building && name) out.push({ building, name });
  }
  if (out.length) return out;

  // Fallback: no colon — treat whole string as the name.
  return [{ building: "", name: raw }];
}

/** Last room entry as "Building: Name" (or just Name). */
export function lastRoomSegment(room: string): string {
  const entries = parseRoomEntries(room);
  if (!entries.length) return "";
  const last = entries[entries.length - 1];
  if (last.building) return `${last.building}: ${last.name}`;
  return last.name;
}

/**
 * Short location for non-Bielsys imports (room name only).
 * e.g. "Tapirbygget: Elektronikklab 314 Bober" → "Elektronikklab 314 Bober"
 */
export function extractImportLocation(room: string): string {
  const entries = parseRoomEntries(room);
  if (!entries.length) return "";
  return entries[entries.length - 1].name;
}

/**
 * Building + room label, e.g. "Realfagbygget R1" or "IT-bygget, sydfløy F1".
 * Uses the last room entry.
 */
export function extractImportLocationFull(room: string): string {
  const entries = parseRoomEntries(room);
  if (!entries.length) return "";
  const last = entries[entries.length - 1];
  if (last.building && last.name) return `${last.building} ${last.name}`;
  return last.name.replace(/\s+/g, " ").trim();
}

/** True when headers match the NTNU/Bielsys timeplan export layout. */
export function isBielsysTimeplan(headers: string[]): boolean {
  const keys = new Set(headers.map(canonicalizeHeader).filter(Boolean));
  return (
    keys.has("dtstart") &&
    keys.has("dtend") &&
    keys.has("teaching_title") &&
    keys.has("summary") &&
    keys.has("room")
  );
}

function buildDescription(n: NormalizedRow): string | undefined {
  // Room goes to `location`; keep organizer-only notes in description.
  if (n.organizer) return `Organizer: ${n.organizer}`;
  return undefined;
}

function compareLocalISO(a: string, b: string): number {
  return a.localeCompare(b);
}

function rowToSession(n: NormalizedRow, bielsys: boolean): ImportedSession | null {
  const teachingTitle = (n.teaching_title || "").trim() || undefined;
  const summary = (n.summary || "").trim() || undefined;
  const title = composeImportSessionTitle(
    teachingTitle,
    summary,
    n.subject || n.title || "",
  );
  if (!title || !n.start || !n.end) return null;
  const startISO = parseImportDateTime(n.start);
  const endISO = parseImportDateTime(n.end);
  if (!startISO || !endISO) return null;
  if (compareLocalISO(endISO, startISO) <= 0) return null;

  const color = resolveSessionColor(n);
  const colorKey = (n.colorKey || n.teaching_title || "").trim() || undefined;
  const locationRaw = (n.room || n.location || "").trim();
  // Bielsys: show "Building Room". Generic imports: short room name only.
  const location = locationRaw
    ? bielsys
      ? extractImportLocationFull(locationRaw)
      : extractImportLocation(locationRaw)
    : undefined;
  const locationFull =
    bielsys && locationRaw ? extractImportLocationFull(locationRaw) : undefined;

  const session: ImportedSession = {
    title,
    startISO,
    endISO,
    allDay: false,
    color,
    ...(teachingTitle ? { teachingTitle } : {}),
    ...(summary ? { summary } : {}),
    ...(location ? { location } : {}),
    ...(locationFull ? { locationFull } : {}),
  };
  const description = buildDescription(n);
  if (description) session.description = description;
  if (n.courseid || n.eventid || colorKey) {
    session.source = {
      ...(n.courseid ? { courseid: n.courseid } : {}),
      ...(n.eventid ? { eventid: n.eventid } : {}),
      ...(colorKey ? { colorKey } : {}),
    };
  }
  return session;
}

function looksLikeMojibake(s: string): boolean {
  // UTF-8 Nordic bytes misread as Latin-1 often produce Ã¸ / Ã¦ / Ã¥
  if (/Ã[\u0080-\u00ff]|â€/.test(s)) return true;
  // Replacement character means decode failed
  if (s.includes("\uFFFD")) return true;
  return false;
}

function decodeCsvText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const latin1 = new TextDecoder("latin1").decode(bytes);

  // Prefer UTF-8 when it looks clean and contains proper Nordic letters or no oddities
  const utf8Bad = looksLikeMojibake(utf8) || utf8.includes("\uFFFD");
  if (!utf8Bad) return utf8;

  // Prefer Latin-1 when UTF-8 is broken (typical Bielsys export)
  return latin1;
}

function detectDelimiter(headerLine: string): ";" | "," {
  let inQuotes = false;
  let semis = 0;
  let commas = 0;
  for (let i = 0; i < headerLine.length; i++) {
    const c = headerLine[i];
    if (c === '"') {
      if (inQuotes && headerLine[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (c === ";") semis++;
    else if (c === ",") commas++;
  }
  return semis >= commas ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: ";" | ","): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function splitCsvLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (c === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        cur += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      cur += c;
      continue;
    }
    if (c === "\n" && !inQuotes) {
      lines.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.length) lines.push(cur);
  return lines.filter((l, idx) => (idx === 0 ? l.length > 0 : l.trim().length > 0));
}

function parseCsvBuffer(bytes: Uint8Array): { rows: Record<string, unknown>[]; warnings: string[] } {
  const warnings: string[] = [];
  const text = decodeCsvText(bytes);
  if (text.includes("\uFFFD")) warnings.push("Some characters could not be decoded cleanly.");

  const lines = splitCsvLines(text);
  if (lines.length === 0) return { rows: [], warnings: ["Empty CSV file."] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delimiter);
    if (cells.every((c) => !c.trim())) continue;
    const row: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c] || `col_${c}`] = cells[c] ?? "";
    }
    rows.push(row);
  }

  return { rows, warnings };
}

function parseExcelBuffer(bytes: Uint8Array): { rows: Record<string, unknown>[]; warnings: string[] } {
  const warnings: string[] = [];
  const workbook = XLSX.read(bytes, { type: "array", cellDates: false, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], warnings: ["Excel workbook has no sheets."] };
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (!rows.length) warnings.push("Excel sheet produced no data rows.");
  return { rows, warnings };
}

function isExcelFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

function isCsvFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".csv") || lower.endsWith(".txt");
}

/** Detect Excel by ZIP/OLE magic when extension is missing/wrong. */
function looksLikeExcel(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // PK.. (xlsx zip)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return true;
  // OLE compound (xls)
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return true;
  return false;
}

export function parseCalendarImportFile(
  input: ArrayBuffer | Uint8Array,
  filename = "import.csv",
): ParseImportResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const warnings: string[] = [];

  let rows: Record<string, unknown>[] = [];
  const useExcel = isExcelFilename(filename) || (!isCsvFilename(filename) && looksLikeExcel(bytes));

  try {
    if (useExcel) {
      const parsed = parseExcelBuffer(bytes);
      rows = parsed.rows;
      warnings.push(...parsed.warnings);
    } else {
      const parsed = parseCsvBuffer(bytes);
      rows = parsed.rows;
      warnings.push(...parsed.warnings);
    }
  } catch (err) {
    return {
      sessions: [],
      skipped: 0,
      warnings: [`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`],
      profile: "generic",
    };
  }

  const headerKeys = rows.length > 0 ? Object.keys(rows[0]) : [];
  const bielsys = isBielsysTimeplan(headerKeys);
  const profile: ImportFileProfile = bielsys ? "bielsys" : "generic";

  const sessions: ImportedSession[] = [];
  let skipped = 0;

  for (const raw of rows) {
    const normalized = smartNormalizeRow(raw);
    const session = rowToSession(normalized, bielsys);
    if (!session) {
      skipped++;
      continue;
    }
    sessions.push(session);
  }

  if (sessions.length === 0 && rows.length > 0) {
    warnings.push("No valid sessions found. Expected dtstart/dtend (or start/end) and a title/summary.");
  }

  return { sessions, skipped, warnings, profile };
}
