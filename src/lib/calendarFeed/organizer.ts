/**
 * Who created a synced-calendar session.
 *
 * Outlook shows a meeting as someone else's when the mailbox owner is an
 * attendee and a different person is the organizer. A missing organizer, or
 * an organizer with no sign that the owner was invited, stays a plain block.
 */

export type FeedParty = {
  organizerEmail?: string | null;
  attendeeEmails?: string[];
};

type AttendeeProperty = {
  getFirstValue?: () => unknown;
  getParameter?: (name: string) => unknown;
};

type PartyComponent = {
  getFirstPropertyValue?: (name: string) => unknown;
  getAllProperties?: (name: string) => AttendeeProperty[];
};

export function calendarEmail(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const mailto = text.match(/mailto:([^>\s,;]+)/i);
  let raw = (mailto?.[1] ?? text).trim().replace(/^mailto:/i, "").replace(/^<|>$/g, "");
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Keep the address as written when it is not percent-encoded.
  }
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  return email;
}

function isCalendarResource(email: string): boolean {
  return (
    email.endsWith("@group.calendar.google.com") ||
    email.endsWith("@resource.calendar.google.com") ||
    email.endsWith("@group.v.calendar.google.com") ||
    email.includes("#holiday@")
  );
}

function people(emails: Iterable<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const value of emails) {
    const email = value ? calendarEmail(value) : null;
    if (email && !isCalendarResource(email)) found.add(email);
  }
  return [...found];
}

/** Organizer and human attendees from one VEVENT. Rooms are not people. */
export function feedParties(component: PartyComponent): {
  organizerEmail: string | null;
  attendeeEmails: string[];
} {
  const organizerEmail = calendarEmail(component.getFirstPropertyValue?.("organizer"));
  const attendees = new Set<string>();
  for (const prop of component.getAllProperties?.("attendee") ?? []) {
    const cutype = String(prop.getParameter?.("cutype") ?? "").toUpperCase();
    if (cutype === "ROOM" || cutype === "RESOURCE") continue;
    const email = calendarEmail(prop.getFirstValue?.());
    if (!email || isCalendarResource(email)) continue;
    attendees.add(email);
  }
  return { organizerEmail, attendeeEmails: [...attendees] };
}

function organizerOf(event: FeedParty): string | null {
  return event.organizerEmail ? calendarEmail(event.organizerEmail) : null;
}

function attendeeSet(event: FeedParty): string[] {
  return people(event.attendeeEmails ?? []);
}

/**
 * Mailbox that owns this synced calendar.
 * The signed-in address wins when the feed actually names it. Otherwise the
 * owner is the one person on every invitation, or the one person who both
 * creates sessions and is invited to others. Anything ambiguous stays unknown.
 */
export function calendarOwnerEmail(events: FeedParty[], accountEmail: string | null): string | null {
  const account = accountEmail ? calendarEmail(accountEmail) : null;
  const named = new Set<string>();
  for (const event of events) {
    const organizer = organizerOf(event);
    if (organizer && !isCalendarResource(organizer)) named.add(organizer);
    for (const email of attendeeSet(event)) named.add(email);
  }
  if (account && named.has(account)) return account;

  const invited = events
    .map((event) => {
      const organizer = organizerOf(event);
      if (!organizer) return null;
      const others = attendeeSet(event).filter((email) => email !== organizer);
      return others.length > 0 ? others : null;
    })
    .filter((emails): emails is string[] => !!emails);
  if (invited.length > 0) {
    let shared = new Set(invited[0]);
    for (const emails of invited.slice(1)) {
      shared = new Set([...shared].filter((email) => emails.includes(email)));
    }
    if (shared.size === 1) return [...shared][0] ?? null;
  }

  const organizers = new Set<string>();
  const attendsOthers = new Set<string>();
  for (const event of events) {
    const organizer = organizerOf(event);
    if (!organizer || isCalendarResource(organizer)) continue;
    organizers.add(organizer);
    for (const email of attendeeSet(event)) {
      if (email !== organizer) attendsOthers.add(email);
    }
  }
  const principals = [...organizers].filter((email) => attendsOthers.has(email));
  if (principals.length === 1) return principals[0] ?? null;
  return null;
}

/** True only when this session was organized by someone other than the mailbox owner, who was invited. */
export function isInvitedByOther(event: FeedParty, owner: string | null): boolean {
  if (!owner) return false;
  const organizer = organizerOf(event);
  if (!organizer || organizer === owner) return false;
  return attendeeSet(event).includes(owner);
}
