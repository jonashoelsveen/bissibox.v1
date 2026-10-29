import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { normalizeFeedUrl } from "./crypto.ts";
import { FeedError, FETCH_TIMEOUT_MS, MAX_BODY_BYTES } from "./types.ts";

export type ResolvedAddress = { address: string; family: number };

export type FeedFetchOk = {
  ok: true;
  status: 200 | 304;
  body: string;
  etag: string | null;
  lastModified: string | null;
  hostname: string;
};

const KNOWN_SUFFIXES = [
  "calendar.google.com",
  "outlook.office365.com",
  "outlook.office.com",
  "outlook.live.com",
  "icloud.com",
];

function hostMatches(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function isKnownCalendarHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return KNOWN_SUFFIXES.some((suffix) => hostMatches(host, suffix));
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

function inRange(ip: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base >>> 0 & mask);
}

export function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value == null) return true;
  const blocked: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return blocked.some(([base, bits]) => inRange(value, ipv4ToInt(base) ?? 0, bits));
}

function ipv4FromMapped(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1] ?? null;
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const hi = parseInt(hex[1] ?? "", 16);
  const lo = parseInt(hex[2] ?? "", 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function isBlockedIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase();
  const mapped = ipv4FromMapped(trimmed);
  if (mapped) return isBlockedIpv4(mapped);
  if (isIP(trimmed) === 4) return isBlockedIpv4(trimmed);
  if (isIP(trimmed) !== 6) return true;
  if (trimmed === "::" || trimmed === "::1") return true;
  const head = trimmed.split(":")[0] ?? "";
  const first = parseInt(head || "0", 16);
  if (!Number.isFinite(first)) return true;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xff00) === 0xff00) return true;
  if (trimmed.startsWith("2001:db8:")) return true;
  if ((first & 0xffc0) === 0xfec0) return true;
  return false;
}

export function validateFeedUrl(raw: string, strict = false): string {
  let normalized: string;
  try {
    normalized = normalizeFeedUrl(raw);
  } catch (error) {
    if (error instanceof FeedError) throw error;
    throw new FeedError("invalid_url");
  }
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new FeedError("invalid_url");
  }
  if (url.username || url.password) throw new FeedError("forbidden_host");
  if (url.protocol !== "https:") throw new FeedError("forbidden_host");
  if (url.port && url.port !== "443") throw new FeedError("forbidden_host");
  const host = url.hostname;
  if (!host || host === "localhost" || isIP(host) !== 0 || /^\d+$/.test(host)) {
    throw new FeedError(host ? "forbidden_host" : "invalid_url");
  }
  if (strict && !isKnownCalendarHost(host)) throw new FeedError("forbidden_host");
  return normalized;
}

export async function defaultResolve(hostname: string): Promise<ResolvedAddress[]> {
  const rows = await dnsLookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => ({ address: row.address, family: row.family }));
}

async function assertPublicHost(
  hostname: string,
  resolve: (hostname: string) => Promise<ResolvedAddress[]>,
): Promise<void> {
  let rows: ResolvedAddress[];
  try {
    rows = await resolve(hostname);
  } catch {
    throw new FeedError("unreachable");
  }
  if (rows.length === 0) throw new FeedError("unreachable");
  if (rows.some((row) => isBlockedIp(row.address))) throw new FeedError("forbidden_host");
}

type LookupAddress = { address: string; family: number };

export function safeLookup(
  resolve: (hostname: string) => Promise<ResolvedAddress[]>,
): (
  hostname: string,
  options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) => void {
  return (hostname, options, callback) => {
    const all = Boolean(options && typeof options === "object" && "all" in options && (options as { all?: boolean }).all);
    resolve(hostname)
      .then((rows) => {
        if (rows.length === 0 || rows.some((row) => isBlockedIp(row.address))) {
          callback(Object.assign(new Error("forbidden_host"), { code: "EACCES" }), all ? [] : "", 4);
          return;
        }
        const list = rows.map((row) => ({ address: row.address, family: row.family }));
        const first = list[0];
        if (!first) {
          callback(Object.assign(new Error("unreachable"), { code: "ENOTFOUND" }), all ? [] : "", 4);
          return;
        }
        if (all) {
          callback(null, list);
          return;
        }
        callback(null, first.address, first.family);
      })
      .catch(() => {
        callback(Object.assign(new Error("unreachable"), { code: "ENOTFOUND" }), all ? [] : "", 4);
      });
  };
}

type FetchLike = (url: string, init: RequestInit & { dispatcher?: unknown }) => Promise<Response>;

function header(response: Response, name: string): string | null {
  const value = response.headers.get(name);
  return value && value.trim() ? value.trim() : null;
}

async function readCapped(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new FeedError("too_large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(body);
}

function isCalendarBody(contentType: string | null, body: string): boolean {
  if ((contentType ?? "").toLowerCase().includes("text/calendar")) return true;
  const trimmed = body.replace(/^\uFEFF/, "").trimStart();
  return trimmed.startsWith("BEGIN:VCALENDAR");
}

export async function fetchCalendarFeed(input: {
  url: string;
  etag?: string | null;
  lastModified?: string | null;
  strict?: boolean;
  timeoutMs?: number;
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  fetchImpl?: FetchLike;
}): Promise<FeedFetchOk> {
  const resolve = input.resolve ?? defaultResolve;
  const timeoutMs = input.timeoutMs ?? FETCH_TIMEOUT_MS;
  const started = Date.now();
  let current = validateFeedUrl(input.url, input.strict ?? false);
  const dispatcher = input.fetchImpl
    ? undefined
    : new Agent({
        connect: {
          lookup: safeLookup(resolve),
        },
      });
  const fetchImpl = input.fetchImpl ?? (undiciFetch as unknown as FetchLike);
  let redirects = 0;
  let conditional = Boolean(input.etag || input.lastModified);

  try {
    while (true) {
      if (Date.now() - started > timeoutMs) throw new FeedError("timeout");
      const url = new URL(current);
      await assertPublicHost(url.hostname, resolve);
      const remaining = Math.max(1, timeoutMs - (Date.now() - started));
      const headers = new Headers({ Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" });
      if (conditional && input.etag) headers.set("If-None-Match", input.etag);
      if (conditional && input.lastModified) headers.set("If-Modified-Since", input.lastModified);
      let response: Response;
      try {
        response = await fetchImpl(current, {
          method: "GET",
          redirect: "manual",
          headers,
          signal: AbortSignal.timeout(remaining),
          dispatcher,
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name === "TimeoutError" || name === "AbortError") throw new FeedError("timeout");
        throw new FeedError("unreachable");
      }
      if (response.status >= 300 && response.status < 400) {
        redirects += 1;
        if (redirects > 3) throw new FeedError("unreachable", "Too many redirects.");
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) throw new FeedError("unreachable");
        current = validateFeedUrl(new URL(location, current).toString(), input.strict ?? false);
        conditional = false;
        continue;
      }
      if (response.status === 304) {
        return {
          ok: true,
          status: 304,
          body: "",
          etag: header(response, "etag") ?? input.etag ?? null,
          lastModified: header(response, "last-modified") ?? input.lastModified ?? null,
          hostname: url.hostname,
        };
      }
      if (response.status < 200 || response.status >= 300) throw new FeedError("unreachable");
      const body = await readCapped(response, MAX_BODY_BYTES);
      if (!isCalendarBody(response.headers.get("content-type"), body)) throw new FeedError("not_calendar");
      return {
        ok: true,
        status: 200,
        body,
        etag: header(response, "etag"),
        lastModified: header(response, "last-modified"),
        hostname: url.hostname,
      };
    }
  } finally {
    if (dispatcher && "close" in dispatcher) {
      await (dispatcher as Agent).close().catch(() => undefined);
    }
  }
}
