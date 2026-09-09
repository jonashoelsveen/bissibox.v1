/**
 * Supabase persistence for Events editor drafts.
 * Maps EventDraft ↔ public.events (+ event_subevents).
 *
 * Extra UI fields (ticket colour, participants, co-organizers, mapbox id,
 * subevent colour/live/endsAt) are stored in events.media_pitch as JSON until
 * migration 20260809150000_events_draft_persistence is applied everywhere.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_SUBEVENT_COLOR,
  DEFAULT_TICKET_COLOR,
  emptyEventLocation,
  EVENT_DESCRIPTION_MAX_CHARS,
  normalizeEventDraft,
  type CoOrganizerDraft,
  type EventDraft,
  type EventParticipantDraft,
  type EventSubeventDraft,
} from "./event-ui-types";

export type EventScope = {
  userId: string;
  /** null = individual workspace */
  teamId: string | null;
};

/** Sentinel for "no time set" while starts_at remains NOT NULL on older DBs. */
const NO_TIME_SENTINEL = "1000-01-01T00:00:00.000Z";

type EventUiMeta = {
  v: 1;
  ticketColor: string;
  mapboxPlaceId: string | null;
  participants: EventParticipantDraft[];
  coOrganizers: CoOrganizerDraft[];
  subevents: Record<
    string,
    { endsAt: string | null; color: string; live: boolean }
  >;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  location: string | null;
  pin_lat: number | null;
  pin_lng: number | null;
  pin_description: string | null;
  media_pitch: string | null;
  mapbox_place_id?: string | null;
  ticket_color?: string | null;
  participants_json?: unknown;
  co_organizer_emails?: unknown;
  created_at: string;
  owner_id: string | null;
  team_id: string | null;
  event_subevents?: SubeventRow[] | null;
};

type SubeventRow = {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at?: string | null;
  sort_order: number;
  color?: string | null;
  live?: boolean | null;
};

function newUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* insecure context / non-HTTPS LAN — fall through */
  }
  // RFC4122-ish v4 fallback (never reuse a fixed id — that causes PK conflicts).
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseMeta(raw: string | null | undefined): EventUiMeta | null {
  if (!raw || !raw.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EventUiMeta> & {
      __aponna_event_ui?: boolean;
    };
    if (parsed.__aponna_event_ui !== true && parsed.v !== 1) return null;
    return {
      v: 1,
      ticketColor:
        typeof parsed.ticketColor === "string" && parsed.ticketColor
          ? parsed.ticketColor
          : DEFAULT_TICKET_COLOR,
      mapboxPlaceId:
        typeof parsed.mapboxPlaceId === "string" ? parsed.mapboxPlaceId : null,
      participants: Array.isArray(parsed.participants)
        ? (parsed.participants as EventParticipantDraft[])
        : [],
      coOrganizers: Array.isArray(parsed.coOrganizers)
        ? (parsed.coOrganizers as CoOrganizerDraft[])
        : [],
      subevents:
        parsed.subevents && typeof parsed.subevents === "object"
          ? (parsed.subevents as EventUiMeta["subevents"])
          : {},
    };
  } catch {
    return null;
  }
}

function encodeMeta(draft: EventDraft): string {
  const subevents: EventUiMeta["subevents"] = {};
  for (const s of draft.subevents) {
    subevents[s.id] = {
      endsAt: s.endsAt,
      color: s.color || DEFAULT_SUBEVENT_COLOR,
      live: s.live === true,
    };
  }
  const payload = {
    __aponna_event_ui: true,
    v: 1 as const,
    ticketColor: draft.ticketColor || DEFAULT_TICKET_COLOR,
    mapboxPlaceId: draft.location.mapboxPlaceId,
    participants: draft.participants,
    coOrganizers: draft.coOrganizers,
    subevents,
  };
  return JSON.stringify(payload);
}

function startsAtFromDb(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("1000-01-01")) return null;
  return value;
}

function startsAtToDb(value: string | null): string {
  return value ?? NO_TIME_SENTINEL;
}

function parseParticipants(raw: unknown): EventParticipantDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const row = p as Partial<EventParticipantDraft>;
      if (typeof row.id !== "string") return null;
      return {
        id: row.id,
        name: typeof row.name === "string" ? row.name : "",
        surname: typeof row.surname === "string" ? row.surname : "",
        sex: typeof row.sex === "string" ? row.sex : "",
        born: typeof row.born === "string" ? row.born : "",
        email: typeof row.email === "string" ? row.email : "",
        phone: typeof row.phone === "string" ? row.phone : "",
        subeventId: typeof row.subeventId === "string" ? row.subeventId : null,
      } satisfies EventParticipantDraft;
    })
    .filter((p): p is EventParticipantDraft => !!p);
}

function parseCoOrganizers(raw: unknown): CoOrganizerDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (typeof c === "string" && c.trim()) {
        return { id: newUuid(), email: c.trim() };
      }
      if (!c || typeof c !== "object") return null;
      const row = c as Partial<CoOrganizerDraft>;
      const email = typeof row.email === "string" ? row.email.trim() : "";
      if (!email) return null;
      return {
        id: typeof row.id === "string" ? row.id : newUuid(),
        email,
      };
    })
    .filter((c): c is CoOrganizerDraft => !!c);
}

function rowToDraft(row: EventRow): EventDraft {
  const meta = parseMeta(row.media_pitch);

  const subevents: EventSubeventDraft[] = (row.event_subevents ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s, i) => {
      const extra = meta?.subevents?.[s.id];
      return {
        id: s.id,
        name: s.name || "Untitled",
        startsAt: startsAtFromDb(s.starts_at),
        endsAt: s.ends_at ?? extra?.endsAt ?? null,
        sortOrder: typeof s.sort_order === "number" ? s.sort_order : i,
        color: s.color || extra?.color || DEFAULT_SUBEVENT_COLOR,
        live: s.live === true || extra?.live === true,
      };
    });

  return {
    id: row.id,
    name: row.title,
    coOrganizers:
      parseCoOrganizers(row.co_organizer_emails).length > 0
        ? parseCoOrganizers(row.co_organizer_emails)
        : (meta?.coOrganizers ?? []),
    createdAt: row.created_at,
    description: (row.description ?? "").slice(0, EVENT_DESCRIPTION_MAX_CHARS),
    startsAt: startsAtFromDb(row.starts_at),
    location: {
      name: row.location ?? "",
      mapboxPlaceId: row.mapbox_place_id ?? meta?.mapboxPlaceId ?? null,
      longitude: row.pin_lng,
      latitude: row.pin_lat,
      pinDescription: row.pin_description,
    },
    subevents,
    participants:
      parseParticipants(row.participants_json).length > 0
        ? parseParticipants(row.participants_json)
        : (meta?.participants ?? []),
    ticketColor: row.ticket_color || meta?.ticketColor || DEFAULT_TICKET_COLOR,
  };
}

async function resolveOrganizer(scope: EventScope): Promise<string> {
  if (scope.teamId) {
    // Entity workspaces live in app_teams (activeEntityId), not legacy teams.
    const { data } = await supabase
      .from("app_teams")
      .select("name")
      .eq("id", scope.teamId)
      .maybeSingle();
    if (data?.name) return data.name;
  }
  const { data } = await supabase
    .from("profiles")
    .select("first_name,last_name")
    .eq("id", scope.userId)
    .maybeSingle();
  const name = `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim();
  return name || "Organizer";
}

async function syncSubevents(eventId: string, subevents: EventSubeventDraft[]) {
  const { data: existing, error: listErr } = await supabase
    .from("event_subevents")
    .select("id")
    .eq("event_id", eventId);
  if (listErr) throw listErr;

  const keep = new Set(subevents.map((s) => s.id));
  const toDelete = (existing ?? [])
    .map((r) => r.id)
    .filter((id) => !keep.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("event_subevents")
      .delete()
      .in("id", toDelete);
    if (error) throw error;
  }

  if (subevents.length === 0) return;

  // Core columns always exist; optional columns are best-effort via upsert shape.
  const rows = subevents.map((s) => ({
    id: s.id,
    event_id: eventId,
    name: s.name.trim() || "Untitled",
    starts_at: s.startsAt ? startsAtToDb(s.startsAt) : null,
    sort_order: s.sortOrder,
  }));

  const { error } = await supabase.from("event_subevents").upsert(rows, {
    onConflict: "id",
  });
  if (error) throw error;
}

const EVENT_SELECT = `
  id, title, description, starts_at, location,
  pin_lat, pin_lng, pin_description, media_pitch,
  created_at, owner_id, team_id,
  event_subevents ( id, name, starts_at, sort_order )
`;

export async function listEventsForScope(scope: EventScope): Promise<EventDraft[]> {
  let query = supabase
    .from("events")
    .select(EVENT_SELECT)
    .order("created_at", { ascending: false });

  if (scope.teamId) {
    query = query.eq("team_id", scope.teamId);
  } else {
    query = query.eq("owner_id", scope.userId).is("team_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as EventRow[]).map(rowToDraft);
}

export async function getEventById(
  scope: EventScope,
  eventId: string,
): Promise<EventDraft | null> {
  let query = supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("id", eventId);

  if (scope.teamId) {
    query = query.eq("team_id", scope.teamId);
  } else {
    query = query.eq("owner_id", scope.userId).is("team_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToDraft(data as EventRow);
}

export async function createEventInDb(
  scope: EventScope,
  name: string,
  coOrganizers: CoOrganizerDraft[],
): Promise<EventDraft> {
  // RLS requires auth.uid() = owner_id. Prefer the JWT user over React state
  // so a stale scope.userId cannot fail the insert.
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error("Sign in to create an event");
  }
  const ownerId = authData.user.id;

  let teamId: string | null = scope.teamId;
  if (teamId) {
    const { data: team, error: teamErr } = await supabase
      .from("app_teams")
      .select("id")
      .eq("id", teamId)
      .maybeSingle();
    if (teamErr) throw teamErr;
    if (!team) {
      // Stale rl_active_entity in localStorage must not block create (FK).
      console.warn("[events] entity id not in app_teams; creating without team_id", teamId);
      teamId = null;
    }
  }

  const organizer = await resolveOrganizer({ userId: ownerId, teamId });
  const id = newUuid();
  const draft: EventDraft = {
    id,
    name: name.trim(),
    coOrganizers,
    createdAt: new Date().toISOString(),
    description: "",
    startsAt: null,
    location: emptyEventLocation(),
    subevents: [],
    participants: [],
    ticketColor: DEFAULT_TICKET_COLOR,
  };

  const row = {
    id,
    title: draft.name,
    organizer,
    description: null as string | null,
    // Column is nullable after draft-persistence migration.
    starts_at: null as string | null,
    owner_id: ownerId,
    team_id: teamId,
    event_type: "event" as const,
    media_pitch: encodeMeta(draft),
    ticket_color: draft.ticketColor,
    participants_json: [] as unknown[],
    co_organizer_emails: coOrganizers.map((c) => c.email.trim()).filter(Boolean),
    published: false,
  };

  const { error } = await supabase.from("events").insert(row);
  if (error) {
    // Retry once without optional draft columns if schema cache is behind.
    const missingCol =
      /participants_json|co_organizer_emails|ticket_color/i.test(error.message) ||
      error.code === "PGRST204";
    if (missingCol) {
      const { error: retryErr } = await supabase.from("events").insert({
        id: row.id,
        title: row.title,
        organizer: row.organizer,
        description: row.description,
        starts_at: row.starts_at ?? NO_TIME_SENTINEL,
        owner_id: row.owner_id,
        team_id: row.team_id,
        event_type: row.event_type,
        media_pitch: row.media_pitch,
        published: row.published,
      });
      if (retryErr) throw retryErr;
      return draft;
    }
    throw error;
  }
  return draft;
}

export async function updateEventInDb(
  scope: EventScope,
  draft: EventDraft,
): Promise<void> {
  const patch = {
    title: draft.name.trim() || "Untitled event",
    description: draft.description.slice(0, EVENT_DESCRIPTION_MAX_CHARS) || null,
    starts_at: startsAtToDb(draft.startsAt),
    location: draft.location.name.trim() || null,
    pin_lat: draft.location.latitude,
    pin_lng: draft.location.longitude,
    pin_description: draft.location.pinDescription,
    media_pitch: encodeMeta(draft),
  };

  let query = supabase.from("events").update(patch).eq("id", draft.id);
  if (scope.teamId) {
    query = query.eq("team_id", scope.teamId);
  } else {
    query = query.eq("owner_id", scope.userId).is("team_id", null);
  }
  const { error } = await query;
  if (error) throw error;

  await syncSubevents(draft.id, draft.subevents);
}

/** One-time: push localStorage drafts into Supabase then clear the key. */
export async function migrateLocalDraftsIfNeeded(
  scope: EventScope,
  scopeKey: string,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const key = `events:drafts:${scopeKey}`;
  const raw = window.localStorage.getItem(key);
  if (!raw) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(key);
    return false;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    window.localStorage.removeItem(key);
    return false;
  }

  const drafts = parsed
    .map((item) => normalizeEventDraft(item))
    .filter((d): d is EventDraft => !!d);

  const organizer = await resolveOrganizer(scope);

  for (const draft of drafts) {
    const idOk = /^[0-9a-f-]{36}$/i.test(draft.id);
    const id = idOk ? draft.id : newUuid();
    const next = { ...draft, id };

    const { error } = await supabase.from("events").upsert(
      {
        id,
        title: next.name.trim() || "Untitled event",
        organizer,
        description: next.description || null,
        starts_at: startsAtToDb(next.startsAt),
        location: next.location.name.trim() || null,
        pin_lat: next.location.latitude,
        pin_lng: next.location.longitude,
        pin_description: next.location.pinDescription,
        media_pitch: encodeMeta(next),
        owner_id: scope.userId,
        team_id: scope.teamId,
        event_type: "event",
        published: false,
        created_at: next.createdAt,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.error("[events] migrate upsert failed", error);
      continue;
    }
    try {
      await syncSubevents(id, next.subevents);
    } catch (e) {
      console.error("[events] migrate subevents failed", e);
    }
  }

  window.localStorage.removeItem(key);
  return drafts.length > 0;
}
