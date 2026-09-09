export type EventSection = "about" | "subevents" | "tickets" | "participants";

export type CoOrganizerDraft = {
  id: string;
  email: string;
};

/** Maps to events.location / pin_* / future mapbox_place_id. */
export type EventLocationDraft = {
  name: string;
  mapboxPlaceId: string | null;
  longitude: number | null;
  latitude: number | null;
  pinDescription: string | null;
};

export type EventSubeventDraft = {
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  /** Same palette as activity-type colors. */
  color: string;
  /** When true, subevent is visible live for participant signup. */
  live: boolean;
};

/** Event signup roster — isolated from entity members (UI style only). */
export type EventParticipantDraft = {
  id: string;
  name: string;
  surname: string;
  sex: string;
  born: string;
  email: string;
  phone: string;
  /** Linked subevent id, or null when unassigned. */
  subeventId: string | null;
};

export type EventDraft = {
  id: string;
  name: string;
  coOrganizers: CoOrganizerDraft[];
  createdAt: string;
  description: string;
  /** Event start — ISO datetime from About Time section (date + hour + minute). */
  startsAt: string | null;
  location: EventLocationDraft;
  subevents: EventSubeventDraft[];
  participants: EventParticipantDraft[];
  /** Ticket stub fill — same palette as activity-type colors. */
  ticketColor: string;
};

export const EVENT_SECTIONS: Array<{
  key: EventSection;
  label: string;
  gapAfter?: boolean;
}> = [
  { key: "about", label: "About", gapAfter: true },
  { key: "subevents", label: "Subevents" },
  { key: "tickets", label: "Tickets", gapAfter: true },
  { key: "participants", label: "Participants" },
];

export function emptyEventLocation(): EventLocationDraft {
  return {
    name: "",
    mapboxPlaceId: null,
    longitude: null,
    latitude: null,
    pinDescription: null,
  };
}

/** Matches ticket face / back height so About description fits the ticket. */
export const EVENT_TICKET_HEIGHT = 300;
/**
 * Storage safety ceiling only — live typing is limited by the ticket-sized
 * description box (capacity ring), not this character count.
 */
export const EVENT_DESCRIPTION_MAX_CHARS = 4000;

/** Default matches new activity tabs until the user picks a color. */
export const DEFAULT_TICKET_COLOR = "#C7C7CC";
export const DEFAULT_SUBEVENT_COLOR = "#C7C7CC";

export function normalizeEventDraft(raw: unknown): EventDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<EventDraft> & { id?: string; name?: string };
  if (typeof d.id !== "string" || typeof d.name !== "string") return null;

  const locationRaw =
    d.location && typeof d.location === "object"
      ? (d.location as Partial<EventLocationDraft>)
      : null;

  const subevents = Array.isArray(d.subevents)
    ? d.subevents
        .map((s, i): EventSubeventDraft | null => {
          if (!s || typeof s !== "object") return null;
          const row = s as Partial<EventSubeventDraft>;
          if (typeof row.id !== "string") return null;
          return {
            id: row.id,
            name: typeof row.name === "string" ? row.name : "Untitled",
            startsAt: typeof row.startsAt === "string" ? row.startsAt : null,
            endsAt: typeof row.endsAt === "string" ? row.endsAt : null,
            sortOrder:
              typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder)
                ? row.sortOrder
                : i,
            color:
              typeof row.color === "string" && row.color
                ? row.color
                : DEFAULT_SUBEVENT_COLOR,
            live: row.live === true,
          };
        })
        .filter((s): s is EventSubeventDraft => !!s)
    : [];

  const participants = Array.isArray(d.participants)
    ? d.participants
        .map((p): EventParticipantDraft | null => {
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
            subeventId:
              typeof row.subeventId === "string" ? row.subeventId : null,
          };
        })
        .filter((p): p is EventParticipantDraft => !!p)
    : [];

  return {
    id: d.id,
    name: d.name,
    coOrganizers: Array.isArray(d.coOrganizers) ? d.coOrganizers : [],
    createdAt:
      typeof d.createdAt === "string" ? d.createdAt : new Date().toISOString(),
    description:
      typeof d.description === "string"
        ? d.description.slice(0, EVENT_DESCRIPTION_MAX_CHARS)
        : "",
    startsAt: typeof d.startsAt === "string" ? d.startsAt : null,
    location: {
      name: typeof locationRaw?.name === "string" ? locationRaw.name : "",
      mapboxPlaceId:
        typeof locationRaw?.mapboxPlaceId === "string"
          ? locationRaw.mapboxPlaceId
          : null,
      longitude:
        typeof locationRaw?.longitude === "number" ? locationRaw.longitude : null,
      latitude:
        typeof locationRaw?.latitude === "number" ? locationRaw.latitude : null,
      pinDescription:
        typeof locationRaw?.pinDescription === "string"
          ? locationRaw.pinDescription
          : null,
    },
    subevents,
    participants,
    ticketColor:
      typeof d.ticketColor === "string" && d.ticketColor
        ? d.ticketColor
        : DEFAULT_TICKET_COLOR,
  };
}

export function sectionLabel(section: EventSection): string {
  return EVENT_SECTIONS.find((s) => s.key === section)?.label ?? section;
}

export function formatSubeventTime(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `datetime-local` value in the user's local timezone. */
export function toDatetimeLocalValue(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a `datetime-local` value back to ISO (or null if empty/invalid). */
export function fromDatetimeLocalValue(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
