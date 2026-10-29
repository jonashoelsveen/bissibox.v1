import ICAL from "ical.js";
import {
  DEFAULT_INTERVAL_SECONDS,
  FeedError,
  MAX_INTERVAL_SECONDS,
  MIN_INTERVAL_SECONDS,
  type ParsedFeed,
} from "./types.ts";
import { windowsToIana } from "./windowsZones.ts";

function durationSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" && typeof value !== "string") return null;
  if (typeof value === "object" && value && "toSeconds" in value && typeof value.toSeconds === "function") {
    const seconds = value.toSeconds();
    return typeof seconds === "number" ? seconds : null;
  }
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text);
  const match = text.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

export function clampInterval(seconds: number | null): number {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return DEFAULT_INTERVAL_SECONDS;
  return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, Math.round(seconds)));
}

function hexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const short = text.match(/^#([0-9a-f]{3})$/i);
  if (short?.[1]) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const long = text.match(/^#([0-9a-f]{6})$/i);
  return long ? `#${long[1]!.toLowerCase()}` : null;
}

function vtimezoneIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const block of text.matchAll(/BEGIN:VTIMEZONE[\s\S]*?END:VTIMEZONE/gi)) {
    const id = block[0].match(/^TZID:(.+)$/m);
    if (id?.[1]) ids.add(id[1].trim());
  }
  return ids;
}

/** Map Windows TZID names to IANA when the feed does not define that zone. */
export function rewriteWindowsTzids(text: string): string {
  const defined = vtimezoneIds(text);
  return text.replace(/TZID(?:=|:)("?)([^";:\r\n]+)\1/g, (full, quote: string, name: string) => {
    const tzid = name.trim();
    if (defined.has(tzid)) return full;
    const iana = windowsToIana(tzid);
    if (!iana) return full;
    const sep = full.startsWith("TZID:") ? ":" : "=";
    return `TZID${sep}${quote}${iana}${quote}`;
  });
}

function calendarText(component: ICAL.Component, name: string): string | null {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseOne(text: string): { component: ICAL.Component; name: string | null; color: string | null; timeZone: string | null; interval: number | null } {
  let component: ICAL.Component;
  try {
    component = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new FeedError("parse_failed");
  }
  if (component.name !== "vcalendar") throw new FeedError("not_calendar");
  const interval =
    durationSeconds(component.getFirstPropertyValue("refresh-interval")) ??
    durationSeconds(component.getFirstPropertyValue("x-published-ttl"));
  return {
    component,
    name: calendarText(component, "name") ?? calendarText(component, "x-wr-calname"),
    color: hexColor(component.getFirstPropertyValue("color")) ?? hexColor(component.getFirstPropertyValue("x-apple-calendar-color")),
    timeZone: calendarText(component, "x-wr-timezone"),
    interval,
  };
}

export function parseFeed(body: string): ParsedFeed {
  const unfolded = rewriteWindowsTzids(body.replace(/^\uFEFF/, ""));
  const chunks = unfolded
    .split(/(?=BEGIN:VCALENDAR)/i)
    .map((chunk) => chunk.trim())
    .filter((chunk) => /^BEGIN:VCALENDAR/i.test(chunk));
  if (chunks.length === 0) throw new FeedError("not_calendar");
  const blocks: unknown[] = [];
  let name: string | null = null;
  let color: string | null = null;
  let timeZone: string | null = null;
  let interval: number | null = null;
  for (const chunk of chunks) {
    const parsed = parseOne(chunk);
    if (!name && parsed.name) name = parsed.name;
    if (!color && parsed.color) color = parsed.color;
    if (!timeZone && parsed.timeZone) timeZone = parsed.timeZone;
    if (interval == null && parsed.interval != null) interval = parsed.interval;
    blocks.push(parsed.component.toJSON());
  }
  return {
    name,
    color,
    timeZone,
    intervalSeconds: clampInterval(interval),
    blocks,
  };
}
