/**
 * Who created a session on a synced calendar.
 *
 * Outlook shows a meeting as someone else's when a different person is the
 * organizer. Published feeds omit the attendee list (RFC 5545), and Exchange
 * often puts the address in an EMAIL parameter instead of a mailto value.
 * An appointment with no organizer stays the calendar owner's own block.
 */

export type FeedParty = {
  organizerEmail?: string | null;
  attendeeEmails?: string[];
  /** Mailbox that owns this feed, when the subscription address identifies one. */
  mailboxEmail?: string | null;
};

type AddressProperty = {
  getFirstValue?: () => unknown;
  getParameter?: (name: string) => unknown;
};

type PartyComponent = {
  getFirstProperty?: (name: string) => AddressProperty | null;
  getFirstPropertyValue?: (name: string) => unknown;
  getAllProperties?: (name: string) => AddressProperty[];
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

function addressOf(prop: AddressProperty | null | undefined): string | null {
  if (!prop) return null;
  return (
    calendarEmail(prop.getFirstValue?.()) ??
    calendarEmail(prop.getParameter?.("email")) ??
    calendarEmail(prop.getParameter?.("sent-by")) ??
    calendarEmail(prop.getParameter?.("cn"))
  );
}

/**
 * Email embedded in a calendar subscription address.
 * Google's secret iCal link carries the mailbox in the path. Holiday and
 * resource calendars are not a person's mailbox.
 */
export function mailboxEmailFromFeedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let pathname = "";
  try {
    pathname = new URL(raw.replace(/^webcal:/i, "https:")).pathname;
  } catch {
    return null;
  }
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  for (const part of decoded.split("/")) {
    const email = calendarEmail(part);
    if (email && !isCalendarResource(email)) return email;
  }
  return null;
}

function propText(component: PartyComponent, name: string): string {
  const value = component.getFirstPropertyValue?.(name);
  return value == null ? "" : String(value).trim();
}

/**
 * Outlook's published calendar removes ORGANIZER and ATTENDEE.
 * A meeting someone else sent is still marked tentative while the
 * organizer's show-as stays busy, and the Teams invitation stays in the
 * description after it is updated. A block the user created is busy, or
 * free and transparent, and does not carry that invitation.
 */
export function outlookInvitedMeeting(component: PartyComponent): boolean {
  const busy = propText(component, "x-microsoft-cdo-busystatus").toUpperCase();
  const intended = propText(component, "x-microsoft-cdo-intendedstatus").toUpperCase();
  const transp = propText(component, "transp").toUpperCase();
  const sequence = Number(propText(component, "sequence") || propText(component, "x-microsoft-cdo-appt-sequence") || "0");
  const description = propText(component, "description");
  const invitation = /microsoft teams meeting/i.test(description)
    || /skype meeting/i.test(description)
    || /_{10,}/.test(description);
  const tentativeInvite = busy === "TENTATIVE"
    && (intended === "BUSY" || intended === "OOF")
    && transp !== "TRANSPARENT";
  return tentativeInvite || (invitation && Number.isFinite(sequence) && sequence > 0);
}

/** Organizer and human attendees from one VEVENT. Rooms are not people. */
export function feedParties(component: PartyComponent): {
  organizerEmail: string | null;
  attendeeEmails: string[];
} {
  const attendees = new Set<string>();
  let chair: string | null = null;
  for (const prop of component.getAllProperties?.("attendee") ?? []) {
    const cutype = String(prop.getParameter?.("cutype") ?? "").toUpperCase();
    if (cutype === "ROOM" || cutype === "RESOURCE") continue;
    const email = addressOf(prop);
    if (!email || isCalendarResource(email)) continue;
    attendees.add(email);
    const role = String(prop.getParameter?.("role") ?? "").toUpperCase();
    if (!chair && role === "CHAIR") chair = email;
  }
  const organizerEmail = addressOf(component.getFirstProperty?.("organizer")) ?? chair;
  return { organizerEmail, attendeeEmails: [...attendees] };
}

function organizerOf(event: FeedParty): string | null {
  const email = event.organizerEmail ? calendarEmail(event.organizerEmail) : null;
  if (!email || isCalendarResource(email)) return null;
  return email;
}

function attendeeSet(event: FeedParty): string[] {
  return people(event.attendeeEmails ?? []);
}

/**
 * Mailbox that owns this synced calendar.
 * A subscription address that names the mailbox wins. Otherwise the signed-in
 * address, when the feed actually names it, then the person the invitations
 * have in common.
 */
export function calendarOwnerEmail(
  events: FeedParty[],
  accountEmail: string | null,
  hints: string[] = [],
): string | null {
  const account = accountEmail ? calendarEmail(accountEmail) : null;
  const named = new Set<string>();
  for (const event of events) {
    const organizer = organizerOf(event);
    if (organizer) named.add(organizer);
    for (const email of attendeeSet(event)) named.add(email);
  }
  for (const event of events) {
    const mailbox = event.mailboxEmail ? calendarEmail(event.mailboxEmail) : null;
    if (mailbox && !isCalendarResource(mailbox)) return mailbox;
  }
  if (account && named.has(account)) return account;
  for (const hint of hints) {
    const email = hint ? calendarEmail(hint) : null;
    if (email && !isCalendarResource(email) && named.has(email)) return email;
  }

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
    if (!organizer) continue;
    organizers.add(organizer);
    for (const email of attendeeSet(event)) {
      if (email !== organizer) attendsOthers.add(email);
    }
  }
  const principals = [...organizers].filter((email) => attendsOthers.has(email));
  if (principals.length === 1) return principals[0] ?? null;
  return null;
}

/**
 * True when a person other than the mailbox owner organized the session.
 * Attendees are not required: Outlook and other published calendars leave
 * them out, and still name the organizer on a meeting.
 */
export function isInvitedByOther(event: FeedParty, owner: string | null): boolean {
  if (!owner) return false;
  const organizer = organizerOf(event);
  if (!organizer) return false;
  return organizer !== owner;
}
