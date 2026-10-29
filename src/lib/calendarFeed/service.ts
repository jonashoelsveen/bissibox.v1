import { randomUUID } from "node:crypto";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";
import { DEFAULT_SESSION_COLOR } from "@/components/library/sessionColors";
import {
  isStale,
  readCache,
  resolveRefresh,
  singleFlight,
  writeCache,
  type CacheEntry,
} from "./cache.ts";
import {
  bufferToBytea,
  byteaToBuffer,
  decryptFeedUrl,
  encryptFeedUrl,
  feedUrlHmac,
  normalizeFeedUrl,
  type FeedKeyMaterial,
} from "./crypto.ts";
import { loadFeedKeys, strictFeedHosts } from "./env.ts";
import { expandFeed } from "./expand.ts";
import { parseFeed } from "./parse.ts";
import { assertRate } from "./rateLimit.ts";
import { fetchCalendarFeed } from "./ssrf.ts";
import { feedVisibleTo } from "./access.ts";
import { isFeatureEnabled } from "@/lib/features";
import { FeedError, MAX_RANGE_DAYS, type ParsedFeed, type SubscriptionEvent } from "./types.ts";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = NonNullable<Awaited<ReturnType<typeof getSupabaseAdminOrNull>>>;

type CalendarRow = {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  source: string;
  deleted_at: string | null;
};

type SecretRow = {
  calendar_id: string;
  owner_id: string;
  url_ciphertext: string;
  url_iv: string;
  key_version: number;
  url_hmac: string;
  label_source: string;
  etag: string | null;
  last_modified: string | null;
  refresh_interval_seconds: number;
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function logFeed(calendarId: string, hostname: string, code: string): void {
  console.error("[calendar feed]", calendarId, hostname, code);
}

async function adminOrThrow(): Promise<Admin> {
  const admin = await getSupabaseAdminOrNull();
  if (!admin) throw new FeedError("unreachable", "Calendar subscriptions are not configured.");
  return admin;
}

function keysOrThrow(): FeedKeyMaterial {
  const keys = loadFeedKeys();
  if (!keys) throw new FeedError("unreachable", "Calendar subscriptions are not configured.");
  return keys;
}

function asUuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function hexColor(value: string): string | null {
  const text = value.trim();
  const short = text.match(/^#([0-9a-f]{3})$/i);
  if (short?.[1]) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const long = text.match(/^#([0-9a-f]{6})$/i);
  return long ? `#${long[1]!.toLowerCase()}` : null;
}

export function rangeIsValid(from: Date, to: Date): boolean {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return false;
  return to.getTime() - from.getTime() <= MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
}

async function ownedCalendar(admin: Admin, userId: string, calendarId: string): Promise<CalendarRow | null> {
  const { data, error } = await admin
    .from("user_calendars")
    .select("id, owner_id, name, color, source, deleted_at")
    .eq("id", calendarId)
    .maybeSingle();
  if (error || !data || !feedVisibleTo(userId, data.owner_id, data.deleted_at)) return null;
  return data;
}

async function secretRow(admin: Admin, calendarId: string): Promise<SecretRow | null> {
  const { data, error } = await admin
    .from("user_calendar_subscriptions")
    .select("calendar_id, owner_id, url_ciphertext, url_iv, key_version, url_hmac, label_source, etag, last_modified, refresh_interval_seconds")
    .eq("calendar_id", calendarId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

function cacheKeyOf(hmac: string): string {
  return byteaToBuffer(hmac).toString("hex");
}

async function markError(admin: Admin, calendarId: string, error: unknown): Promise<void> {
  const code = error instanceof FeedError ? error.code : "unreachable";
  const message = error instanceof FeedError ? error.message : "The calendar could not be reached.";
  await admin
    .from("user_calendar_subscriptions")
    .update({
      sync_status: "error",
      last_attempt_at: new Date().toISOString(),
      last_error: `${code}: ${message}`.slice(0, 240),
      updated_at: new Date().toISOString(),
    })
    .eq("calendar_id", calendarId);
}

async function markOk(
  admin: Admin,
  calendar: CalendarRow,
  secret: SecretRow,
  entry: CacheEntry,
  parsed: ParsedFeed | null,
): Promise<void> {
  await admin
    .from("user_calendar_subscriptions")
    .update({
      sync_status: "ok",
      last_attempt_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: null,
      etag: entry.etag,
      last_modified: entry.lastModified,
      refresh_interval_seconds: entry.intervalSeconds,
      updated_at: new Date().toISOString(),
    })
    .eq("calendar_id", calendar.id);
  if (parsed?.name && secret.label_source === "feed" && parsed.name !== calendar.name) {
    await admin
      .from("user_calendars")
      .update({ name: parsed.name.slice(0, 120), updated_at: new Date().toISOString() })
      .eq("id", calendar.id);
  }
}

async function refetch(
  admin: Admin,
  calendar: CalendarRow,
  secret: SecretRow,
  keys: FeedKeyMaterial,
  force: boolean,
): Promise<CacheEntry> {
  const key = cacheKeyOf(secret.url_hmac);
  const cached = readCache(key);
  if (cached && !force && !isStale(cached)) return cached;
  return singleFlight(key, async () => {
    const current = readCache(key);
    if (current && !force && !isStale(current)) return current;
    let url = "";
    try {
      url = decryptFeedUrl(
        byteaToBuffer(secret.url_ciphertext),
        byteaToBuffer(secret.url_iv),
        calendar.id,
        calendar.owner_id,
        keys.encKey,
      );
    } catch (error) {
      logFeed(calendar.id, "", error instanceof FeedError ? error.code : "decrypt");
      await markError(admin, calendar.id, error);
      if (current) return current;
      throw error;
    }
    const host = hostnameOf(url);
    try {
      let fetched = await fetchCalendarFeed({
        url,
        etag: current ? current.etag ?? secret.etag : null,
        lastModified: current ? current.lastModified ?? secret.last_modified : null,
        strict: strictFeedHosts(),
      });
      if (fetched.status === 304 && !current) {
        fetched = await fetchCalendarFeed({ url, strict: strictFeedHosts() });
      }
      const resolved = resolveRefresh({
        cached: current,
        outcome: fetched.status === 304 ? "not_modified" : "ok",
        parsed: fetched.status === 200 ? parseFeed(fetched.body) : null,
        etag: fetched.etag,
        lastModified: fetched.lastModified,
      });
      if (!resolved.entry) throw new FeedError("unreachable");
      writeCache(key, resolved.entry);
      await markOk(admin, calendar, secret, resolved.entry, fetched.status === 200 ? resolved.entry.model : null);
      return resolved.entry;
    } catch (error) {
      logFeed(calendar.id, host, error instanceof FeedError ? error.code : "unreachable");
      await markError(admin, calendar.id, error);
      if (current) return current;
      throw error;
    }
  });
}

/** A soft-deleted calendar must not keep its URL reserved. A live one still does. */
async function feedUrlIsStillAdded(admin: Admin, userId: string, hmac: Buffer): Promise<boolean> {
  const { data, error } = await admin
    .from("user_calendar_subscriptions")
    .select("calendar_id, url_hmac")
    .eq("owner_id", userId);
  if (error) throw new FeedError("unreachable");
  for (const row of data ?? []) {
    let rowHmac: Buffer;
    try {
      const stored = row.url_hmac.trim();
      rowHmac =
        stored.startsWith("\\x") || stored.startsWith("\\X")
          ? byteaToBuffer(stored)
          : /^[0-9a-f]+$/i.test(stored) && stored.length % 2 === 0
            ? Buffer.from(stored, "hex")
            : byteaToBuffer(stored);
    } catch {
      continue;
    }
    if (rowHmac.length !== hmac.length || !rowHmac.equals(hmac)) continue;
    const { data: calendar, error: calendarError } = await admin
      .from("user_calendars")
      .select("deleted_at")
      .eq("id", row.calendar_id)
      .maybeSingle();
    if (calendarError) throw new FeedError("unreachable");
    if (calendar && calendar.deleted_at == null) return true;
    const { error: deleteError } = await admin
      .from("user_calendar_subscriptions")
      .delete()
      .eq("calendar_id", row.calendar_id);
    if (deleteError) throw new FeedError("unreachable");
  }
  return false;
}

async function calendarTabsGranted(admin: Admin, userId: string): Promise<boolean> {
  if (isFeatureEnabled("calendarTabsFlag")) return true;
  const { data, error } = await admin
    .from("feature_flag_users")
    .select("user_id")
    .eq("flag_key", "calendarTabsFlag")
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export async function createSubscription(
  userId: string,
  input: { url: string; label?: string | null; entityId?: string | null; appGroupId?: string | null },
): Promise<{ id: string; name: string; color: string }> {
  assertRate(`feed:create:${userId}`, 10, HOUR);
  const admin = await adminOrThrow();
  if (!(await calendarTabsGranted(admin, userId))) {
    throw new FeedError("forbidden");
  }
  const keys = keysOrThrow();
  const fetched = await fetchCalendarFeed({ url: input.url, strict: strictFeedHosts() });
  const parsed = parseFeed(fetched.body);
  const typedLabel = input.label?.trim().slice(0, 120) ?? "";
  const normalized = normalizeFeedUrl(input.url);
  const name = (typedLabel || parsed.name || hostnameOf(normalized) || "Calendar").slice(0, 120);
  const color = parsed.color ?? DEFAULT_SESSION_COLOR;
  const calendarId = randomUUID();
  const hmac = feedUrlHmac(normalized, keys.hmacKey);
  if (await feedUrlIsStillAdded(admin, userId, hmac)) {
    throw new FeedError("invalid_url", "This calendar is already added.");
  }
  const sealed = encryptFeedUrl(normalized, calendarId, userId, keys);
  const { data: existingOrder } = await admin
    .from("user_calendars")
    .select("sort_order")
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1);
  const sortOrder = (existingOrder?.[0]?.sort_order ?? 0) + 1;
  const entityId = asUuid(input.entityId);
  const appGroupId = asUuid(input.appGroupId);
  const { error: calendarError } = await admin.from("user_calendars").insert({
    id: calendarId,
    owner_id: userId,
    name,
    color,
    source: "subscription",
    entity_id: entityId,
    app_group_id: appGroupId,
    sort_order: sortOrder,
  });
  if (calendarError) throw new FeedError("unreachable");
  const { error: secretError } = await admin.from("user_calendar_subscriptions").insert({
    calendar_id: calendarId,
    owner_id: userId,
    url_ciphertext: bufferToBytea(sealed.ciphertext),
    url_iv: bufferToBytea(sealed.iv),
    key_version: sealed.keyVersion,
    url_hmac: bufferToBytea(hmac),
    label_source: typedLabel ? "user" : "feed",
    sync_status: "ok",
    last_success_at: new Date().toISOString(),
    last_attempt_at: new Date().toISOString(),
    etag: fetched.etag,
    last_modified: fetched.lastModified,
    refresh_interval_seconds: parsed.intervalSeconds,
  });
  if (secretError) {
    await admin.from("user_calendars").delete().eq("id", calendarId);
    if (secretError.code === "23505") throw new FeedError("invalid_url", "This calendar is already added.");
    throw new FeedError("unreachable");
  }
  writeCache(hmac.toString("hex"), {
    model: parsed,
    fetchedAt: Date.now(),
    etag: fetched.etag,
    lastModified: fetched.lastModified,
    intervalSeconds: parsed.intervalSeconds,
  });
  return { id: calendarId, name, color };
}

export async function subscriptionEvents(
  userId: string,
  calendarId: string,
  from: Date,
  to: Date,
  timeZone: string,
): Promise<SubscriptionEvent[]> {
  assertRate(`feed:events:${userId}`, 120, MINUTE);
  if (!rangeIsValid(from, to)) throw new FeedError("too_large", "That date range is too long.");
  const keys = keysOrThrow();
  const admin = await adminOrThrow();
  const calendar = await ownedCalendar(admin, userId, calendarId);
  if (!calendar || calendar.source !== "subscription") throw new FeedError("forbidden_host", "Calendar not found.");
  const secret = await secretRow(admin, calendarId);
  if (!secret || secret.owner_id !== userId) throw new FeedError("forbidden_host", "Calendar not found.");
  const entry = await refetch(admin, calendar, secret, keys, false);
  return expandFeed(entry.model, { calendarId, from, to, timeZone: timeZone || "UTC" });
}

export async function refreshSubscription(userId: string, calendarId: string): Promise<{ syncStatus: "ok" | "error" }> {
  assertRate(`feed:refresh:${userId}`, 6, HOUR);
  assertRate(`feed:refresh:${userId}:${calendarId}`, 1, MINUTE);
  const keys = keysOrThrow();
  const admin = await adminOrThrow();
  const calendar = await ownedCalendar(admin, userId, calendarId);
  if (!calendar || calendar.source !== "subscription") throw new FeedError("forbidden_host", "Calendar not found.");
  const secret = await secretRow(admin, calendarId);
  if (!secret || secret.owner_id !== userId) throw new FeedError("forbidden_host", "Calendar not found.");
  const before = readCache(cacheKeyOf(secret.url_hmac));
  const entry = await refetch(admin, calendar, secret, keys, true);
  return { syncStatus: before && entry === before ? "error" : "ok" };
}

export async function updateSubscription(
  userId: string,
  calendarId: string,
  patch: { label?: string | null; color?: string | null },
): Promise<{ id: string; name: string; color: string }> {
  assertRate(`feed:update:${userId}`, 30, MINUTE);
  const admin = await adminOrThrow();
  const calendar = await ownedCalendar(admin, userId, calendarId);
  if (!calendar || calendar.source !== "subscription") throw new FeedError("forbidden_host", "Calendar not found.");
  const next: { name?: string; color?: string; updated_at: string } = { updated_at: new Date().toISOString() };
  if (typeof patch.label === "string") {
    const label = patch.label.trim().slice(0, 120);
    if (!label) throw new FeedError("invalid_url", "Enter a name.");
    next.name = label;
  }
  if (typeof patch.color === "string") {
    const color = hexColor(patch.color);
    if (!color) throw new FeedError("invalid_url", "That colour can't be used.");
    next.color = color;
  }
  const { data, error } = await admin
    .from("user_calendars")
    .update(next)
    .eq("id", calendarId)
    .select("id, name, color")
    .single();
  if (error || !data) throw new FeedError("unreachable");
  return data;
}

export async function deleteSubscription(userId: string, calendarId: string): Promise<void> {
  assertRate(`feed:delete:${userId}`, 20, HOUR);
  const admin = await adminOrThrow();
  const calendar = await ownedCalendar(admin, userId, calendarId);
  if (!calendar) throw new FeedError("forbidden_host", "Calendar not found.");
  const { error: secretError } = await admin
    .from("user_calendar_subscriptions")
    .delete()
    .eq("calendar_id", calendarId);
  if (secretError) throw new FeedError("unreachable");
  const { error } = await admin
    .from("user_calendars")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", calendarId)
    .eq("owner_id", userId);
  if (error) throw new FeedError("unreachable");
}
