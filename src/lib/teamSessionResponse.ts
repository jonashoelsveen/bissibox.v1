/**
 * A member's private answer to a team session. The shared session stays as
 * the team saved it. Only this member's tiles change.
 */
import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  sessionMonthChipChrome,
  sessionTileChrome,
  sessionWeekDayTileFill,
  withTeamSessionStripes,
} from "@/components/library/sessionColors";

export type TeamSessionResponse = "accepted" | "declined";

const STORAGE_KEY = "calendar.teamSessionResponse.v1";
const DECLINED_FILL = "#e5e5ea";
const DECLINED_FG = "#8e8e93";
const DECLINED_BAR = "#d1d1d6";
const DECLINED_FILL_DARK = "#3a3a3c";
const DECLINED_FG_DARK = "#c7c7cc";
const DECLINED_BAR_DARK = "#2c2c2e";

function declinedPaint(dark: boolean): { fill: string; fg: string; bar: string } {
  if (dark) return { fill: DECLINED_FILL_DARK, fg: DECLINED_FG_DARK, bar: DECLINED_BAR_DARK };
  return { fill: DECLINED_FILL, fg: DECLINED_FG, bar: DECLINED_BAR };
}

type ByEvent = Record<string, TeamSessionResponse>;
type ByUser = Record<string, ByEvent>;

const EMPTY_EVENTS: ByEvent = {};
let snapshot: ByUser = {};
const listeners = new Set<() => void>();

function readStored(): ByUser {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ByUser;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let loaded = false;

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  snapshot = readStored();
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ByUser {
  ensureLoaded();
  return snapshot;
}

function getServerSnapshot(): ByUser {
  return {};
}

export function setTeamSessionResponse(
  userId: string,
  eventId: string,
  response: TeamSessionResponse | null,
) {
  if (!userId || !eventId) return;
  ensureLoaded();
  const prev = snapshot[userId] ?? EMPTY_EVENTS;
  if ((prev[eventId] ?? null) === response) return;
  const nextEvents = { ...prev };
  if (response == null) delete nextEvents[eventId];
  else nextEvents[eventId] = response;
  snapshot = { ...snapshot, [userId]: nextEvents };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore quota */
  }
  pendingWrites.add(writeKey(userId, eventId));
  noteAudienceResponse(eventId, userId, response);
  emit();
  void persistTeamSessionResponse(userId, eventId, response);
}

const pendingWrites = new Set<string>();
const failedWrites = new Set<string>();

function writeKey(userId: string, eventId: string) {
  return `${userId}:${eventId}`;
}

type ResponseRow = { session_id: string; user_id: string; response: string };

type ResponseFilter = Promise<{ data: ResponseRow[] | null; error: { message: string } | null }> & {
  eq: (column: string, value: string) => ResponseFilter;
  in: (column: string, values: string[]) => ResponseFilter;
};

type ResponseQuery = {
  select: (columns: string) => ResponseFilter;
  upsert: (
    row: { session_id: string; user_id: string; response: string; updated_at: string },
    options: { onConflict: string },
  ) => Promise<{ error: { message: string } | null }>;
  delete: () => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function responseTable(): ResponseQuery {
  return (supabase as unknown as { from: (table: string) => ResponseQuery }).from(
    "calendar_session_responses",
  );
}

function asResponse(value: string): TeamSessionResponse | null {
  return value === "accepted" || value === "declined" ? value : null;
}

async function persistTeamSessionResponse(
  userId: string,
  eventId: string,
  response: TeamSessionResponse | null,
) {
  const key = writeKey(userId, eventId);
  pendingWrites.add(key);
  try {
    const table = responseTable();
    const result =
      response == null
        ? await table.delete().eq("session_id", eventId).eq("user_id", userId)
        : await table.upsert(
            {
              session_id: eventId,
              user_id: userId,
              response,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "session_id,user_id" },
          );
    if (result.error) failedWrites.add(key);
    else {
      failedWrites.delete(key);
      void refreshSessionAudience(eventId);
    }
  } catch {
    failedWrites.add(key);
  } finally {
    pendingWrites.delete(key);
  }
}

export type SessionAudienceResponses = {
  byUser: ByEvent;
  byMember: ByEvent;
};

const EMPTY_AUDIENCE: SessionAudienceResponses = {
  byUser: EMPTY_EVENTS,
  byMember: EMPTY_EVENTS,
};

type AudienceEntry = SessionAudienceResponses & {
  memberUser: Record<string, string>;
};

let audienceSnapshot: Record<string, AudienceEntry> = {};
const audienceListeners = new Set<() => void>();

function emitAudience() {
  audienceListeners.forEach((listener) => listener());
}

function noteAudienceResponse(
  sessionId: string,
  userId: string,
  response: TeamSessionResponse | null,
) {
  const prev = audienceSnapshot[sessionId] ?? {
    ...EMPTY_AUDIENCE,
    memberUser: {},
  };
  const byUser = { ...prev.byUser };
  const byMember = { ...prev.byMember };
  if (response == null) {
    delete byUser[userId];
    for (const [memberId, owner] of Object.entries(prev.memberUser)) {
      if (owner === userId) delete byMember[memberId];
    }
  } else {
    byUser[userId] = response;
  }
  audienceSnapshot = {
    ...audienceSnapshot,
    [sessionId]: { byUser, byMember, memberUser: prev.memberUser },
  };
  emitAudience();
}

type SignupRosterRow = { member_id: string; user_id: string; response: string };

async function loadSignupRoster(sessionId: string): Promise<SignupRosterRow[] | null> {
  const client = supabase as unknown as {
    rpc: (
      fn: string,
      args: { p_session_id: string },
    ) => Promise<{ data: SignupRosterRow[] | null; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("calendar_session_signup_roster", {
    p_session_id: sessionId,
  });
  if (error || !data) return null;
  return data;
}

export async function refreshSessionAudience(sessionId: string) {
  try {
    const roster = await loadSignupRoster(sessionId);
    const byUser: ByEvent = {};
    const byMember: ByEvent = {};
    const memberUser: Record<string, string> = {};
    if (roster) {
      for (const row of roster) {
        const response = asResponse(row.response);
        if (!response) continue;
        byUser[row.user_id] = response;
        byMember[row.member_id] = response;
        memberUser[row.member_id] = row.user_id;
      }
    } else {
      const { data, error } = await responseTable()
        .select("session_id, user_id, response")
        .eq("session_id", sessionId);
      if (error || !data) return;
      for (const row of data) {
        const response = asResponse(row.response);
        if (response) byUser[row.user_id] = response;
      }
    }
    const prev = audienceSnapshot[sessionId];
    if (prev) {
      for (const [userId, response] of Object.entries(prev.byUser)) {
        const key = writeKey(userId, sessionId);
        if (pendingWrites.has(key) || failedWrites.has(key)) byUser[userId] = response;
      }
    }
    audienceSnapshot = {
      ...audienceSnapshot,
      [sessionId]: { byUser, byMember, memberUser },
    };
    emitAudience();
  } catch {
    /* ignore */
  }
}

export async function refreshOwnTeamSessionResponses(userId: string, sessionIds: readonly string[]) {
  if (!userId || sessionIds.length === 0) return;
  try {
    const { data, error } = await responseTable()
      .select("session_id, user_id, response")
      .in("session_id", [...sessionIds])
      .eq("user_id", userId);
    if (error || !data) return;
    ensureLoaded();
    const prev = snapshot[userId] ?? EMPTY_EVENTS;
    const next = { ...prev };
    const returned = new Set<string>();
    for (const row of data) {
      const response = asResponse(row.response);
      if (!response) continue;
      returned.add(row.session_id);
      const key = writeKey(userId, row.session_id);
      if (!pendingWrites.has(key) && !failedWrites.has(key)) {
        next[row.session_id] = response;
        noteAudienceResponse(row.session_id, userId, response);
      }
    }
    for (const id of sessionIds) {
      const key = writeKey(userId, id);
      if (returned.has(id) || pendingWrites.has(key) || failedWrites.has(key)) continue;
      delete next[id];
    }
    snapshot = { ...snapshot, [userId]: next };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* ignore quota */
    }
    emit();
  } catch {
    /* ignore */
  }
}

export function useSyncOwnTeamSessionResponses(sessionIds: readonly string[]) {
  const { user } = useAuth();
  const key = sessionIds.join("\0");
  useEffect(() => {
    if (!user?.id || sessionIds.length === 0) return;
    void refreshOwnTeamSessionResponses(user.id, sessionIds);
  }, [user?.id, key, sessionIds]);
}

export function useSessionAudienceResponses(sessionId: string | null): SessionAudienceResponses {
  const all = useSyncExternalStore(
    (listener) => {
      audienceListeners.add(listener);
      return () => audienceListeners.delete(listener);
    },
    () => audienceSnapshot,
    () => ({}) as Record<string, AudienceEntry>,
  );
  useEffect(() => {
    if (!sessionId) return;
    void refreshSessionAudience(sessionId);
    const id = window.setInterval(() => {
      void refreshSessionAudience(sessionId);
    }, 8000);
    return () => window.clearInterval(id);
  }, [sessionId]);
  if (!sessionId) return EMPTY_AUDIENCE;
  return all[sessionId] ?? EMPTY_AUDIENCE;
}

/** Accepted and cancelled paint only apply after the team turns sign-up on. */
export function signupResponse(
  signUpEnabled: boolean | null | undefined,
  responses: ByEvent,
  eventId: string,
): TeamSessionResponse | null {
  if (!signUpEnabled) return null;
  return responses[eventId] ?? null;
}

export function useTeamSessionResponses(): ByEvent {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const all = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!userId) return EMPTY_EVENTS;
  return all[userId] ?? EMPTY_EVENTS;
}

export function teamMemberTilePaint(
  teamColor: string | null | undefined,
  active: boolean,
  response: TeamSessionResponse | null,
  dark = false,
): { fill: string; fg: string; bar: string } {
  if (response === "declined") return declinedPaint(dark);
  const chrome = sessionTileChrome(teamColor, active);
  if (response === "accepted") {
    return { ...chrome, fill: sessionWeekDayTileFill(teamColor, active, dark) };
  }
  const quiet = sessionWeekDayTileFill(teamColor, active, dark);
  if (quiet === chrome.fill) {
    return { fill: withTeamSessionStripes(chrome.fill), fg: chrome.fg, bar: chrome.bar };
  }
  return {
    fill: `${withTeamSessionStripes(`${teamColor}1F`)}, var(--card)`,
    fg: chrome.fg,
    bar: chrome.bar,
  };
}

export function teamMemberMonthChip(
  teamColor: string | null | undefined,
  active: boolean,
  response: TeamSessionResponse | null,
  dark = false,
): { backgroundColor?: string; background?: string; color: string; boxShadow: string } {
  if (response === "declined") {
    const paint = declinedPaint(dark);
    return {
      backgroundColor: paint.fill,
      color: paint.fg,
      boxShadow: `inset 3px 0 0 ${paint.bar}`,
    };
  }
  if (response === "accepted") {
    return sessionMonthChipChrome(teamColor, active);
  }
  const chip = sessionMonthChipChrome(teamColor, active);
  return {
    color: chip.color,
    boxShadow: chip.boxShadow,
    background: withTeamSessionStripes(chip.backgroundColor),
  };
}
