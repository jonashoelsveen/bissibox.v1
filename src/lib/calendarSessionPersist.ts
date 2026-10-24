/**
 * Calendar session persistence — Dexie replica + outbox first, Postgres is ground truth.
 *
 * Optimistic UI writes the replica and mutation WAL before any network call.
 * `/api/calendar/sessions` is the only durable API. A GET that does not contain
 * a pending id never acks that mutation and never replaces the replica.
 */

import { supabase } from "@/integrations/supabase/client";
import { isEntityFeatureEnabled } from "@/lib/features";
import { notifyCalendarSessionsChanged } from "@/lib/calendarSessionSync";
import { entityCalendarSessionCorePayload, entityCalendarSessionRpcPayload } from "@/lib/calendarEntitySessionPayload";
import {
  ackCalendarSessionWrite,
  listMutations,
  listMutationsSync,
  listReplicaEvents,
  listReplicaEventsSync,
  markReplicaSessionsSynced,
  migrateLegacyLocalCalendar,
  removeReplicaSession,
  replaceReplicaCalendar,
  stageCalendarSessionDelete,
  stageCalendarSessionUpsert,
  type ReplicaEvent,
} from "@/lib/calendarSessionReplica";
import { parseVisibleCalendar } from "@/lib/calendarVisiblePayload";

const LAST_SCOPE_KEY = "calendar:last-scope:v1";
const SIGNED_OUT_KEY = "calendar:signed-out:v1";

const WRITE_COLUMNS = [
  "id",
  "user_id",
  "entity_id",
  "starts_at",
  "ends_at",
  "all_day",
  "title",
  "color",
  "category",
  "category_id",
  "description",
  "location",
  "location_url",
  "activity",
  "distance_km",
  "pace_sec_per_km",
  "diary_type",
  "diary_group",
  "diary_sub",
  "session_note",
  "session_note_updated_at",
  "sort_index",
  "app_group_id",
  "signup_enabled",
  "repeat_rule",
  "repeat_series_id",
  "created_by_coach_id",
  "coach_pending",
] as const;

export type LocalCalendarSession = {
  id: string;
  title: string;
  startISO: string;
  endISO: string;
};

export type CalendarSessionRow = Record<string, unknown> & { id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function teamIdFromCalId(calId: string): string | null {
  const entityId = calId.startsWith("diary:team:")
    ? calId.slice(11)
    : calId.startsWith("team:")
      ? calId.slice(5)
      : null;
  return entityId && UUID_RE.test(entityId) ? entityId : null;
}

export { stageCalendarSessionDelete, stageCalendarSessionUpsert };

/** Retry unsynced writes only on the calendar they belong to.
 * Entity overlay rows on a personal calendar must not be rewritten as personal. */
export function persistRetryCalId(
  calId: string,
  entityId: string | null | undefined,
): string | null {
  if (!calId || calId === "anon") return null;
  if (typeof entityId === "string" && entityId) {
    return teamIdFromCalId(calId) === entityId ? calId : null;
  }
  return calId;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const pendingById = new Map<string, Promise<void>>();

export function enqueueCalendarSessionWrite(id: string, task: () => Promise<void>): Promise<void> {
  const previous = pendingById.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  const tracked = next.then(
    () => undefined,
    (error) => {
      console.error("[calendar_sessions write queue]", error);
    },
  );
  pendingById.set(id, tracked);
  void tracked.finally(() => {
    if (pendingById.get(id) === tracked) pendingById.delete(id);
  });
  return next;
}

export async function flushCalendarSessionWrites(): Promise<void> {
  await Promise.allSettled([...pendingById.values()]);
}

export function isCalendarSessionWritePending(id: string): boolean {
  return pendingById.has(id);
}

export type LastCalendarScope = {
  calId: string;
  calTitle: string;
  userId: string;
};

export function readLastCalendarScope(): LastCalendarScope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_SCOPE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastCalendarScope>;
    if (
      typeof parsed.calId === "string" &&
      parsed.calId.length > 0 &&
      parsed.calId !== "anon" &&
      typeof parsed.calTitle === "string" &&
      typeof parsed.userId === "string"
    ) {
      return { calId: parsed.calId, calTitle: parsed.calTitle, userId: parsed.userId };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeLastCalendarScope(scope: LastCalendarScope) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_SCOPE_KEY, JSON.stringify(scope));
  } catch {
    /* quota */
  }
}

export function isCalendarExplicitlySignedOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markCalendarSignedOut() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearCalendarSignedOut() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* ignore */
  }
}

function isLocalSession(value: unknown): value is LocalCalendarSession {
  if (!value || typeof value !== "object") return false;
  const row = value as LocalCalendarSession;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    row.title.trim().length > 0 &&
    typeof row.startISO === "string" &&
    row.startISO.length > 0 &&
    typeof row.endISO === "string" &&
    row.endISO.length > 0
  );
}

/** Load the durable replica for a calendar (sync WAL + memory; Dexie hydrates in the background). */
export function loadLocalCalendar(_userId: string | null | undefined, calId: string): LocalCalendarSession[] {
  if (!calId || calId === "anon") return [];
  void migrateLegacyLocalCalendar();
  return listReplicaEventsSync(calId).filter(isLocalSession) as LocalCalendarSession[];
}

export function saveLocalCalendar(
  _userId: string | null | undefined,
  calId: string,
  events: readonly object[],
) {
  if (!calId || calId === "anon") return;
  const titled = events.filter((row) => isLocalSession(row)) as ReplicaEvent[];
  const syncedById = new Map(listReplicaEventsSync(calId).map((row) => [row.id, row.synced]));
  void replaceReplicaCalendar(
    calId,
    titled.map((event) => ({ ...event, synced: syncedById.get(event.id) ?? false })),
  );
}

export async function loadReplicaCalendar(calId: string): Promise<Array<ReplicaEvent & { synced: boolean }>> {
  if (!calId || calId === "anon") return [];
  return listReplicaEvents(calId);
}

function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function compactSession(session: CalendarSessionRow): CalendarSessionRow {
  const row: CalendarSessionRow = { id: session.id };
  for (const key of WRITE_COLUMNS) {
    if (key === "id") continue;
    const value = session[key];
    if (value === undefined) continue;
    if (key === "category_id" || key === "app_group_id" || key === "repeat_series_id") {
      row[key] = uuidOrNull(value);
      continue;
    }
    row[key] = value;
  }
  return row;
}

function minimalSession(session: CalendarSessionRow): CalendarSessionRow {
  return {
    id: session.id,
    user_id: session.user_id,
    entity_id: session.entity_id ?? null,
    starts_at: session.starts_at,
    ends_at: session.ends_at,
    all_day: session.all_day ?? false,
    title: session.title,
    created_by_coach_id: session.created_by_coach_id ?? null,
    coach_pending: session.coach_pending ?? false,
  };
}

function logWriteError(stage: string, error: { message?: string; code?: string; details?: string; hint?: string } | null) {
  console.error("[calendar_sessions persist]", stage, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    /* ignore */
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function rehydrateSupabaseSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!body.access_token || !body.refresh_token) return false;
    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Bearer + JSON headers. Rehydrates the supabase-js session from the cookie when missing/expired. */
export async function authHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  let { data } = await supabase.auth.getSession();
  const expiresAtMs = (data.session?.expires_at ?? 0) * 1000;
  if (!data.session?.access_token || expiresAtMs <= Date.now() + 15_000) {
    await rehydrateSupabaseSession();
    ({ data } = await supabase.auth.getSession());
  }
  if (data.session?.access_token) {
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return headers;
}

function applyEntityScope(calId: string, row: CalendarSessionRow): CalendarSessionRow {
  const entityId = teamIdFromCalId(calId);
  if (entityId) return { ...row, entity_id: entityId };
  return row;
}

async function insertThenUpdate(
  client: typeof supabase,
  payload: CalendarSessionRow,
): Promise<{ error: { message?: string; code?: string; details?: string; hint?: string } | null }> {
  const insertOnce = async (row: CalendarSessionRow) => {
    const { data, error } = await client
      .from("calendar_sessions")
      .insert(row as never)
      .select("id")
      .maybeSingle();
    return { data, error };
  };
  const updateOnce = async (row: CalendarSessionRow) => {
    const { id, ...patch } = row;
    const { data, error } = await client
      .from("calendar_sessions")
      .update(patch as never)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    return { data, error };
  };

  const tryRow = async (row: CalendarSessionRow, stage: string) => {
    const updated = await updateOnce(row);
    if (!updated.error && updated.data?.id) return { error: null };
    const missing =
      updated.error?.code === "PGRST116" || (!updated.error && !updated.data);
    if (!missing && updated.error && updated.error.code !== "23505") {
      logWriteError(`${stage}:update`, updated.error);
    }
    const inserted = await insertOnce(row);
    if (!inserted.error && inserted.data?.id) return { error: null };
    if (inserted.error?.code === "23505" || (!inserted.error && !inserted.data)) {
      const retry = await updateOnce(row);
      if (!retry.error && retry.data?.id) return { error: null };
      logWriteError(stage, retry.error ?? inserted.error ?? updated.error);
      return { error: retry.error ?? inserted.error ?? updated.error ?? { message: "Update not confirmed" } };
    }
    logWriteError(stage, inserted.error ?? updated.error);
    return { error: inserted.error ?? updated.error ?? { message: "Write not confirmed" } };
  };

  let result = await tryRow(payload, "insert");
  if (!result.error) return result;
  const msg = result.error.message || "";
  if (/category_id|app_group_id|location_url|\blocation\b|signup_enabled|repeat_rule|repeat_series_id/i.test(msg)) {
    const stripped = { ...payload };
    if (/category_id/i.test(msg)) delete stripped.category_id;
    if (/app_group_id/i.test(msg)) delete stripped.app_group_id;
    if (/location_url/i.test(msg)) delete stripped.location_url;
    if (/\blocation\b/i.test(msg) && !/location_url/i.test(msg)) delete stripped.location;
    if (/signup_enabled/i.test(msg)) delete stripped.signup_enabled;
    if (/repeat_rule/i.test(msg)) delete stripped.repeat_rule;
    if (/repeat_series_id/i.test(msg)) delete stripped.repeat_series_id;
    result = await tryRow(stripped, "insert-stripped");
    if (!result.error) return result;
  }
  return tryRow(minimalSession(payload), "insert-minimal");
}

async function persistViaClient(calId: string, session: CalendarSessionRow): Promise<boolean> {
  let row = applyEntityScope(calId, compactSession(session));
  if (typeof row.user_id !== "string" || !row.user_id) {
    await authHeaders();
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (uid) row = { ...row, user_id: uid };
  }
  if (typeof row.user_id !== "string" || !row.user_id) {
    console.error("[calendar_sessions persist client] missing user_id; aborting insert");
    return false;
  }
  if (row.coach_pending == null) row.coach_pending = false;
  if (!("created_by_coach_id" in row)) row.created_by_coach_id = null;

  const entityId = teamIdFromCalId(calId);
  const attempts = entityId ? [minimalSession(row), row] : [row];
  let error: { message?: string; code?: string; details?: string; hint?: string } | null = {
    message: "Write not attempted",
  };
  for (const attempt of attempts) {
    ({ error } = await insertThenUpdate(supabase, attempt));
    if (error) {
      const hydrated = await rehydrateSupabaseSession();
      if (hydrated) ({ error } = await insertThenUpdate(supabase, attempt));
    }
    if (!error) break;
  }
  if (error) {
    logWriteError("client", error);
    return false;
  }
  if (entityId) return confirmStoredEntitySession(row.id, entityId);
  return true;
}

async function confirmStoredEntitySession(id: string, entityId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("calendar_sessions")
    .select("id, entity_id")
    .eq("id", id)
    .maybeSingle();
  return (
    !error &&
    typeof data?.id === "string" &&
    data.id.toLowerCase() === id.toLowerCase() &&
    typeof data?.entity_id === "string" &&
    data.entity_id.toLowerCase() === entityId.toLowerCase()
  );
}

async function persistViaApi(calId: string, session: CalendarSessionRow): Promise<boolean> {
  try {
    const scoped = applyEntityScope(calId, compactSession(session));
    const entityId = teamIdFromCalId(calId);
    if (entityId && !scoped.entity_id) {
      console.error("[calendar_sessions persist] team calId missing entity_id", calId);
      return false;
    }
    const rpcPayload = entityId ? entityCalendarSessionRpcPayload(scoped, entityId) : null;
    const body = JSON.stringify({ calId, session: rpcPayload ?? scoped });
    const send = async () =>
      fetch("/api/calendar/sessions", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: await authHeaders(),
        body,
      });

    let res = await send();
    if (res.status === 401) {
      const hydrated = await rehydrateSupabaseSession();
      if (hydrated) res = await send();
    }
    if (!res.ok) {
      console.error("[calendar_sessions persist]", res.status, await readError(res));
      return false;
    }
    const json = (await res.json()) as { ok?: boolean; id?: string; entity_id?: string };
    if (json.ok !== true || typeof json.id !== "string") return false;
    if (json.id.toLowerCase() !== session.id.toLowerCase()) return false;
    if (!entityId) return true;
    if (json.entity_id === entityId) return true;
    return confirmStoredEntitySession(session.id, entityId);
  } catch (error) {
    console.error("[calendar_sessions persist] api threw", error);
    return false;
  }
}

async function persistViaEntityRpc(calId: string, session: CalendarSessionRow): Promise<boolean> {
  const entityId = teamIdFromCalId(calId);
  if (!entityId) return false;
  const scoped = applyEntityScope(calId, compactSession(session));
  const core = entityCalendarSessionCorePayload(scoped, entityId);
  const payload = entityCalendarSessionRpcPayload(scoped, entityId);
  if (!core) {
    console.error("[calendar_sessions persist] entity-rpc skipped: invalid payload", session.id);
    return false;
  }
  await authHeaders();
  const { data: sessionData } = await supabase.auth.getSession();
  const actorId = sessionData.session?.user?.id;
  const matches = (rpcId: unknown) =>
    rpcId != null && String(rpcId).toLowerCase() === session.id.toLowerCase();

  const tryPayload = async (p: Record<string, string | boolean>, stage: string) => {
    if (typeof actorId === "string" && actorId) {
      const sendFor = () =>
        supabase.rpc("upsert_entity_calendar_session_for", {
          p_actor: actorId,
          p: p as never,
        });
      let { data, error } = await sendFor();
      if (error) {
        const hydrated = await rehydrateSupabaseSession();
        if (hydrated) ({ data, error } = await sendFor());
      }
      if (!error && matches(data)) return true;
      if (error) logWriteError(`${stage}-for`, error);
    }
    const send = () => supabase.rpc("upsert_entity_calendar_session", { p: p as never });
    let { data, error } = await send();
    if (error) {
      const hydrated = await rehydrateSupabaseSession();
      if (hydrated) ({ data, error } = await send());
    }
    if (!error && matches(data)) return true;
    if (error) logWriteError(stage, error);
    return false;
  };

  if (payload && (await tryPayload(payload, "entity-rpc-full"))) return true;
  if (await tryPayload(core, "entity-rpc-core")) return true;
  return false;
}

async function persistOnce(calId: string, session: CalendarSessionRow): Promise<boolean> {
  const entityId = teamIdFromCalId(calId);
  const row = entityId ? { ...session, entity_id: entityId } : session;
  if (entityId) {
    try {
      if (await persistViaApi(calId, row)) return true;
    } catch (error) {
      console.error("[calendar_sessions persist] api path threw", error);
    }
    try {
      if (await persistViaEntityRpc(calId, row)) return true;
    } catch (error) {
      console.error("[calendar_sessions persist] entity-rpc threw", error);
    }
    try {
      if (await persistViaClient(calId, row)) return true;
    } catch (error) {
      console.error("[calendar_sessions persist] entity client path threw", error);
    }
    console.error("[calendar_sessions persist] entity write did not confirm", row.id, "calId", calId);
    return false;
  }
  try {
    if (await persistViaApi(calId, row)) return true;
  } catch (error) {
    console.error("[calendar_sessions persist] api path threw", error);
  }
  try {
    return await persistViaClient(calId, row);
  } catch (error) {
    console.error("[calendar_sessions persist] client path threw", error);
    return false;
  }
}

export function compactCalendarSession(session: CalendarSessionRow): CalendarSessionRow {
  return compactSession(session);
}

export async function persistCalendarSession(
  calId: string,
  session: CalendarSessionRow,
  event?: object | null,
): Promise<boolean> {
  if (!calId || calId === "anon") {
    console.error("[calendar_sessions persist] skipped: invalid calId", calId);
    return false;
  }
  let row = applyEntityScope(calId, compactSession(session));
  if (teamIdFromCalId(calId) && (typeof row.entity_id !== "string" || !row.entity_id)) {
    console.error("[calendar_sessions persist] skipped: team session missing entity_id", calId);
    return false;
  }
  if (typeof row.user_id !== "string" || !row.user_id) {
    await authHeaders();
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (uid) row = { ...row, user_id: uid };
  }
  if (row.coach_pending == null) row.coach_pending = false;
  if (row.signup_enabled == null) row.signup_enabled = false;
  stageCalendarSessionUpsert(calId, row, event ?? null);
  let accepted = false;
  try {
    accepted = await persistOnce(calId, row);
    if (!accepted) {
      for (let attempt = 1; attempt < 3; attempt++) {
        await sleep(400 * attempt);
        accepted = await persistOnce(calId, row);
        if (accepted) break;
      }
    }
  } catch (error) {
    console.error("[calendar_sessions persist] persistOnce threw", error);
    accepted = false;
  }
  if (!accepted) {
    console.error("[calendar_sessions persist] insert did not confirm for", row.id, "calId", calId);
    return false;
  }
  // Leave the replica unsynced. Acking here (even after a GET that contained
  // the id) let the next reload drop the tile when that GET missed it.
  const teamId = calId.startsWith("diary:team:")
    ? calId.slice(11)
    : calId.startsWith("team:")
      ? calId.slice(5)
      : null;
  if (teamId && UUID_RE.test(teamId)) {
    const uid =
      (typeof row.user_id === "string" && row.user_id) ||
      (await supabase.auth.getUser()).data.user?.id ||
      "";
    if (uid) void notifyCalendarSessionsChanged(supabase, uid, teamId);
  }
  return true;
}

async function deleteViaApi(ids: string[]): Promise<boolean> {
  const send = async () =>
    fetch("/api/calendar/sessions", {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
      headers: await authHeaders(),
      body: JSON.stringify({ ids }),
    });
  let res = await send();
  if (res.status === 401) {
    const hydrated = await rehydrateSupabaseSession();
    if (hydrated) res = await send();
  }
  if (res.ok) return true;
  console.error("[calendar_sessions delete]", res.status, await readError(res));
  return false;
}

async function deleteViaClient(ids: string[]): Promise<boolean> {
  const { error } = await supabase.from("calendar_sessions").delete().in("id", ids);
  if (!error) return true;
  const hydrated = await rehydrateSupabaseSession();
  if (hydrated) {
    const retry = await supabase.from("calendar_sessions").delete().in("id", ids);
    if (!retry.error) return true;
    console.error("[calendar_sessions delete client]", retry.error);
    return false;
  }
  console.error("[calendar_sessions delete client]", error);
  return false;
}

export async function deleteCalendarSessions(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  return (await deleteViaApi(ids)) || (await deleteViaClient(ids));
}

export async function fetchCalendarSessions(
  calId: string,
): Promise<
  | { ok: true; rows: CalendarSessionRow[]; memberships: MembershipSessionTeam[] }
  | { ok: false }
> {
  const send = async () =>
    fetch(`/api/calendar/sessions?calId=${encodeURIComponent(calId)}`, {
      method: "GET",
      credentials: "include",
      headers: { ...((await authHeaders()) as Record<string, string>), Accept: "application/json" },
    });

  try {
    let res = await send();
    if (res.status === 401) {
      const hydrated = await rehydrateSupabaseSession();
      if (hydrated) res = await send();
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false };
    }
    if (res.ok) {
      const parsed = parseMembershipPayload(await res.json());
      const attached = await attachMemberOverlay(calId, parsed.rows, parsed.memberships);
      return { ok: true, rows: attached.rows, memberships: attached.memberships };
    }
  } catch (error) {
    console.error("[calendar_sessions fetch]", error);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) return { ok: false };

  try {
    if (calId.startsWith("user:") || calId.startsWith("diary:user:")) {
      const sendRpc = () => supabase.rpc("list_visible_calendar_sessions");
      let { data, error } = await sendRpc();
      if (error) {
        const hydrated = await rehydrateSupabaseSession();
        if (hydrated) ({ data, error } = await sendRpc());
      }
      if (!error && data != null) {
        const parsed = parseMembershipPayload(data);
        const attached = await attachMemberOverlay(calId, parsed.rows, parsed.memberships);
        return { ok: true, rows: attached.rows, memberships: attached.memberships };
      }
    }
    const isPersonal = calId.startsWith("user:") || calId.startsWith("diary:user:");
    const personalUserId = calId.startsWith("diary:user:")
      ? calId.slice(11)
      : calId.startsWith("user:")
        ? calId.slice(5)
        : null;
    let q = supabase.from("calendar_sessions").select("*");
    if (calId.startsWith("team:")) q = q.eq("entity_id", calId.slice(5));
    else if (isPersonal && personalUserId) q = q.eq("user_id", personalUserId).is("entity_id", null);
    else if (calId.startsWith("client:")) q = q.eq("user_id", calId.slice(7)).is("entity_id", null);
    else if (calId.startsWith("diary:team:")) q = q.eq("entity_id", calId.slice(11));
    else if (calId.startsWith("diary:client:")) q = q.eq("user_id", calId.slice(13)).is("entity_id", null);
    else return { ok: false };
    const { data, error } = await q;
    if (error) {
      logWriteError("list-client", error);
      return { ok: false };
    }
    const rows: CalendarSessionRow[] = [];
    for (const row of data ?? []) {
      if (row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string") {
        rows.push(row as CalendarSessionRow);
      }
    }
    /** Client entity-row overlay — Bucket A: skip unless entityCalendarSharing. */
    if (isPersonal && isEntityFeatureEnabled("entityCalendarSharing")) {
      const { data: entityRows, error: entityError } = await supabase
        .from("calendar_sessions")
        .select("*")
        .not("entity_id", "is", null);
      if (entityError) logWriteError("list-client-entity", entityError);
      else {
        for (const row of entityRows ?? []) {
          if (row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string") {
            rows.push(row as CalendarSessionRow);
          }
        }
      }
    }
    const attached = await attachMemberOverlay(calId, rows, []);
    return { ok: true, rows: attached.rows, memberships: attached.memberships };
  } catch {
    return { ok: false };
  }
}

/** Cookie API: sessions for one entity the signed-in user belongs to. */
export async function fetchEntityCalendarSessions(entityId: string): Promise<CalendarSessionRow[]> {
  if (!UUID_RE.test(entityId)) return [];
  try {
    const send = async () =>
      fetch(`/api/calendar/entity-sessions?entityId=${encodeURIComponent(entityId)}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          ...((await authHeaders()) as Record<string, string>),
          Accept: "application/json",
        },
      });
    let res = await send();
    if (res.status === 401) {
      const hydrated = await rehydrateSupabaseSession();
      if (hydrated) res = await send();
    }
    if (!res.ok) return [];
    return parseMembershipPayload(await res.json()).rows;
  } catch (error) {
    console.error("[calendar_sessions entity fetch]", error);
    return [];
  }
}

export type MembershipSessionTeam = {
  teamId: string;
  name: string;
  appGroupId: string | null;
  groupIds: string[];
};

function parseMembershipPayload(data: unknown): {
  memberships: MembershipSessionTeam[];
  rows: CalendarSessionRow[];
} {
  const parsed = parseVisibleCalendar(data);
  return { memberships: parsed.memberships, rows: parsed.sessions };
}

function mergeSessionRows(
  primary: CalendarSessionRow[],
  extra: CalendarSessionRow[],
): CalendarSessionRow[] {
  const byId = new Map<string, CalendarSessionRow>();
  for (const row of primary) byId.set(row.id, row);
  for (const row of extra) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

async function fetchEntitySessionsByTeamIds(teamIds: string[]): Promise<CalendarSessionRow[]> {
  const ids = [...new Set(teamIds.filter((id) => UUID_RE.test(id)))];
  if (ids.length === 0) return [];
  const lists = await Promise.all(ids.map((entityId) => fetchEntityCalendarSessions(entityId)));
  const rows: CalendarSessionRow[] = [];
  const seen = new Set<string>();
  for (const extra of lists) {
    for (const row of extra) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

async function fetchOwnMembershipTeams(): Promise<MembershipSessionTeam[]> {
  await authHeaders();
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("entity_members")
    .select("team_id")
    .eq("user_id", uid)
    .in("status", ["active", "roster"]);
  if (error || !data) return [];
  const ids = [
    ...new Set(
      data
        .map((row) => row.team_id)
        .filter((id): id is string => typeof id === "string" && UUID_RE.test(id)),
    ),
  ];
  return ids.map((teamId) => ({
    teamId,
    name: "Entity",
    appGroupId: null,
    groupIds: [],
  }));
}

function sessionGroupId(row: CalendarSessionRow): string | null {
  return typeof row.app_group_id === "string" && row.app_group_id.length > 0 ? row.app_group_id : null;
}

/** Keep a team session on a member calendar only when All or their group matches. */
function memberCanSeeSession(
  row: CalendarSessionRow,
  memberships: MembershipSessionTeam[],
): boolean {
  const entityId = typeof row.entity_id === "string" && row.entity_id.length > 0 ? row.entity_id : null;
  if (!entityId) return true;
  if (memberships.length === 0) return true;
  const membership = memberships.find((item) => item.teamId === entityId);
  if (!membership) return false;
  const groupId = sessionGroupId(row);
  if (!groupId) return true;
  const groups =
    membership.groupIds.length > 0
      ? membership.groupIds
      : membership.appGroupId
        ? [membership.appGroupId]
        : [];
  return groups.includes(groupId);
}

async function attachMemberOverlay(
  calId: string,
  rows: CalendarSessionRow[],
  memberships: MembershipSessionTeam[],
): Promise<{ rows: CalendarSessionRow[]; memberships: MembershipSessionTeam[] }> {
  const ownEntityId = teamIdFromCalId(calId);
  if (ownEntityId) {
    return {
      rows: rows.filter((row) => row.entity_id === ownEntityId),
      memberships: [],
    };
  }
  if (!calId.startsWith("user:") && !calId.startsWith("diary:user:")) {
    return { rows, memberships };
  }
  if (!isEntityFeatureEnabled("entityCalendarSharing")) {
    return {
      rows: rows.filter((row) => memberCanSeeSession(row, memberships)),
      memberships,
    };
  }
  let nextMemberships = memberships;
  if (nextMemberships.length === 0) {
    nextMemberships = await fetchOwnMembershipTeams();
  }
  const overlayRows = await fetchEntitySessionsByTeamIds(nextMemberships.map((row) => row.teamId));
  const knownMemberships = nextMemberships.length > 0 ? nextMemberships : memberships;
  return {
    rows: mergeSessionRows(rows, overlayRows).filter((row) => memberCanSeeSession(row, knownMemberships)),
    memberships: knownMemberships,
  };
}

/** Cookie API first (service-role lookup by session user). Client RPC is fallback. */
export async function fetchMembershipSessions(): Promise<
  | { ok: true; memberships: MembershipSessionTeam[]; rows: CalendarSessionRow[] }
  | { ok: false; status?: number }
> {
  const send = async () =>
    fetch("/api/calendar/membership-sessions", {
      method: "GET",
      credentials: "include",
      headers: { ...((await authHeaders()) as Record<string, string>), Accept: "application/json" },
    });

  try {
    let res = await send();
    if (res.status === 401) {
      const hydrated = await rehydrateSupabaseSession();
      if (hydrated) res = await send();
    }
    if (res.ok) {
      const parsed = parseMembershipPayload(await res.json());
      const attached = await attachMemberOverlay("user:self", parsed.rows, parsed.memberships);
      return { ok: true, ...attached };
    }
  } catch (error) {
    console.error("[calendar_sessions membership fetch]", error);
  }

  try {
    await authHeaders();
    const sendRpc = () => supabase.rpc("list_visible_calendar_sessions");
    let { data, error } = await sendRpc();
    if (error) {
      const hydrated = await rehydrateSupabaseSession();
      if (hydrated) ({ data, error } = await sendRpc());
    }
    if (!error && data != null) {
      const parsed = parseMembershipPayload(data);
      const attached = await attachMemberOverlay("user:self", parsed.rows, parsed.memberships);
      return { ok: true, ...attached };
    }
  } catch (error) {
    console.error("[calendar_sessions membership rpc]", error);
  }
  return { ok: false };
}

export async function persistCalendarSessionDelete(calId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  for (const id of ids) stageCalendarSessionDelete(calId, id);
  const ok = await deleteCalendarSessions(ids);
  if (!ok && teamIdFromCalId(calId)) {
    await authHeaders();
    let rpcOk = true;
    for (const id of ids) {
      const { error } = await supabase.rpc("delete_entity_calendar_session", { p_id: id });
      if (error) {
        logWriteError("entity-rpc-delete", error);
        rpcOk = false;
        break;
      }
      await removeReplicaSession(id);
    }
    if (rpcOk) {
      const teamId = teamIdFromCalId(calId);
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (teamId && uid) void notifyCalendarSessionsChanged(supabase, uid, teamId);
      return true;
    }
  }
  if (!ok) {
    console.error("[calendar_sessions persist] delete did not confirm", ids, "calId", calId);
    return false;
  }
  const remote = await fetchCalendarSessions(calId);
  if (!remote.ok) return false;
  const remaining = new Set(remote.rows.map((row) => row.id));
  let allGone = true;
  for (const id of ids) {
    if (remaining.has(id)) {
      allGone = false;
      continue;
    }
    await removeReplicaSession(id);
  }
  return allGone;
}

export async function ackMergedCalendarWrites(ackUpsertIds: string[], ackDeleteIds: string[]): Promise<void> {
  if (ackUpsertIds.length > 0) {
    await markReplicaSessionsSynced(ackUpsertIds);
    await Promise.all(ackUpsertIds.map((id) => ackCalendarSessionWrite(id, true)));
  }
  for (const id of ackDeleteIds) {
    await removeReplicaSession(id);
  }
}

async function drainPendingCalendarWrites(): Promise<void> {
  const items = await listMutations();
  const deletesByCal = new Map<string, string[]>();
  for (const item of items) {
    if (item.op === "delete") {
      const ids = deletesByCal.get(item.calId) ?? [];
      ids.push(item.id);
      deletesByCal.set(item.calId, ids);
      continue;
    }
    if (item.session) {
      await persistCalendarSession(item.calId, item.session, item.event ?? null);
    }
  }
  for (const [calId, ids] of deletesByCal) {
    await persistCalendarSessionDelete(calId, ids);
  }
}

/** Flush in-flight writes and retry anything still waiting for a DB ACK. */
export async function drainCalendarSessionOutbox(): Promise<void> {
  await flushCalendarSessionWrites();
  await drainPendingCalendarWrites();
}

export function flushCalendarSessionOutboxKeepalive() {
  flushOutboxKeepalive();
}

function flushOutboxKeepalive() {
  const items = listMutationsSync();
  for (const item of items) {
    if (item.op === "delete") {
      void fetch("/api/calendar/sessions", {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
        keepalive: true,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ids: [item.id] }),
      }).catch(() => undefined);
      continue;
    }
    if (!item.session) continue;
    void fetch("/api/calendar/sessions", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ calId: item.calId, session: applyEntityScope(item.calId, compactSession(item.session)) }),
    }).catch(() => undefined);
  }
}

let syncListenersInstalled = false;

export function installCalendarSessionSyncListeners() {
  if (syncListenersInstalled || typeof window === "undefined") return;
  syncListenersInstalled = true;
  window.addEventListener("online", () => {
    void drainCalendarSessionOutbox();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void drainCalendarSessionOutbox();
  });
  window.addEventListener("pagehide", () => {
    flushOutboxKeepalive();
  });
}

if (typeof window !== "undefined") {
  installCalendarSessionSyncListeners();
}
