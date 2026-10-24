/**
 * Parse list_visible_calendar_sessions JSON.
 * PostgREST may return the jsonb as an object, a string, or nested strings.
 */

export type MemberEntityMembership = {
  teamId: string;
  name: string;
  appGroupId: string | null;
  groupIds: string[];
};

export type CalendarSessionRecord = Record<string, unknown> & { id: string };

export type VisibleCalendarPayload = {
  memberships: MemberEntityMembership[];
  sessions: CalendarSessionRecord[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | null {
  if (typeof value === "string" && UUID_RE.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) return null;
  if (value != null && typeof value === "object" && "toString" in value) {
    const text = String(value);
    return UUID_RE.test(text) ? text : null;
  }
  return null;
}

function parseJsonValue(value: unknown): unknown {
  let raw: unknown = value;
  for (let i = 0; i < 3; i++) {
    if (typeof raw !== "string") break;
    const trimmed = raw.trim();
    if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[" && trimmed[0] !== '"')) break;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      break;
    }
  }
  return raw;
}

function asSessionRow(row: unknown): CalendarSessionRecord | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = asUuid(record.id);
  if (!id) return null;
  const next: CalendarSessionRecord = { ...record, id };
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === "bigint") next[key] = value.toString();
  }
  return next;
}

function parseStringList(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  const ids: string[] = [];
  for (const item of parsed) {
    const uuid = asUuid(item);
    if (uuid) ids.push(uuid);
  }
  return ids;
}

export function mergeSessionLists(
  ...lists: Array<Iterable<CalendarSessionRecord> | null | undefined>
): CalendarSessionRecord[] {
  const byId = new Map<string, CalendarSessionRecord>();
  for (const list of lists) {
    if (!list) continue;
    for (const row of list) {
      if (row?.id) byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

export function parseVisibleCalendar(data: unknown): VisibleCalendarPayload {
  let raw = parseJsonValue(data);
  if (Array.isArray(raw) && raw.length === 1) raw = raw[0];
  const payload =
    raw && typeof raw === "object"
      ? (raw as { memberships?: unknown; sessions?: unknown })
      : {};

  const memberships: MemberEntityMembership[] = [];
  const membershipRows = parseJsonValue(payload.memberships);
  if (Array.isArray(membershipRows)) {
    for (const row of membershipRows) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const teamId = asUuid(record.teamId ?? record.team_id);
      if (!teamId) continue;
      const appGroupId = asUuid(record.appGroupId ?? record.app_group_id);
      const groupIds = parseStringList(record.groupIds ?? record.group_ids);
      if (groupIds.length === 0 && appGroupId) groupIds.push(appGroupId);
      const name = record.name;
      memberships.push({
        teamId,
        name: typeof name === "string" && name.trim() ? name : "Entity",
        appGroupId,
        groupIds,
      });
    }
  }

  const sessions: CalendarSessionRecord[] = [];
  const sessionRows = parseJsonValue(payload.sessions);
  if (Array.isArray(sessionRows)) {
    for (const row of sessionRows) {
      const parsed = asSessionRow(row);
      if (parsed) sessions.push(parsed);
    }
  }

  return { memberships, sessions };
}

export function sessionEntityId(row: CalendarSessionRecord): string | null {
  return asUuid(row.entity_id ?? row.entityId);
}

/**
 * Team session audience:
 * - no group (`null`) means every member of that team
 * - a group id means only members assigned to that group
 */
export function entitySessionVisibleToMember(
  appGroupId: string | null | undefined,
  memberGroupIds: ReadonlySet<string> | readonly string[],
  isMember: boolean,
): boolean {
  if (!isMember) return false;
  if (typeof appGroupId !== "string" || appGroupId.length === 0) return true;
  if (memberGroupIds instanceof Set) return memberGroupIds.has(appGroupId);
  return memberGroupIds.includes(appGroupId);
}

export function jsonSafeStringify(data: unknown): string {
  return JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}
