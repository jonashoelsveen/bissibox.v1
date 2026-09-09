import {
  createUserSupabaseClient,
  type AuthenticatedContext,
} from "@/lib/account-auth.server";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";
import {
  mergeSessionLists,
  parseVisibleCalendar,
  sessionEntityId,
  type CalendarSessionRecord,
  type MemberEntityMembership,
  type VisibleCalendarPayload,
} from "@/lib/calendarVisiblePayload";
import { entityFeatureAllowedForActor } from "@/lib/entity-feature.server";

export type { CalendarSessionRecord, MemberEntityMembership, VisibleCalendarPayload };
export { parseVisibleCalendar };

function asUuid(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asSessionRow(row: unknown): CalendarSessionRecord | null {
  if (!row || typeof row !== "object") return null;
  const id = (row as { id?: unknown }).id;
  const idText = typeof id === "string" ? id : id != null ? String(id) : "";
  if (!idText) return null;
  const next: CalendarSessionRecord = { ...(row as Record<string, unknown>), id: idText };
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === "bigint") next[key] = value.toString();
  }
  return next;
}

type MemberRow = {
  id: string;
  team_id: string;
  app_group_id: string | null;
};

function sessionVisibleToMember(
  row: CalendarSessionRecord,
  groupsByTeam: Map<string, Set<string>>,
): boolean {
  const entityId = asUuid(row.entity_id);
  if (!entityId || !groupsByTeam.has(entityId)) return false;
  const groupId = asUuid(row.app_group_id);
  if (!groupId) return true;
  return groupsByTeam.get(entityId)!.has(groupId);
}

/**
 * Cookie user id → entity_members → calendar_sessions.entity_id.
 * Does not depend on auth.uid() inside a SECURITY DEFINER RPC.
 */
export async function loadSessionsByEntityMembership(
  ctx: AuthenticatedContext,
  onlyEntityId?: string | null,
): Promise<VisibleCalendarPayload> {
  const email = typeof ctx.user.email === "string" ? ctx.user.email.trim().toLowerCase() : "";
  const admin = await getSupabaseAdminOrNull();
  const userClient = await createUserSupabaseClient(ctx.accessToken, ctx.refreshToken);
  const reader = admin ?? userClient;

  const memberById = new Map<string, MemberRow>();
  const ingest = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const id = asUuid((row as { id?: unknown }).id);
      const teamId = asUuid((row as { team_id?: unknown }).team_id);
      if (!id || !teamId) continue;
      memberById.set(id, {
        id,
        team_id: teamId,
        app_group_id: asUuid((row as { app_group_id?: unknown }).app_group_id),
      });
    }
  };

  const { data: byUser, error: byUserError } = await reader
    .from("entity_members")
    .select("id, team_id, app_group_id, status")
    .eq("user_id", ctx.user.id)
    .in("status", ["active", "roster"]);
  if (byUserError) console.error("[calendar visible] entity_members by user", byUserError.message);
  ingest(byUser);

  if (admin && email && !/[%_]/.test(email)) {
    const { data: byEmail, error: byEmailError } = await admin
      .from("entity_members")
      .select("id, team_id, app_group_id, status")
      .ilike("email", email)
      .in("status", ["active", "roster"]);
    if (byEmailError) console.error("[calendar visible] entity_members by email", byEmailError.message);
    ingest(byEmail);
  }

  let members = [...memberById.values()];
  if (onlyEntityId) members = members.filter((row) => row.team_id === onlyEntityId);

  const teamIds = [...new Set(members.map((row) => row.team_id))];
  const nameByTeam = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: teams } = await reader.from("app_teams").select("id, name").in("id", teamIds);
    for (const team of teams ?? []) {
      if (!team || typeof team.id !== "string") continue;
      nameByTeam.set(
        team.id,
        typeof team.name === "string" && team.name.trim() ? team.name : "Entity",
      );
    }
  }

  const groupsByTeam = new Map<string, Set<string>>();
  const addGroup = (teamId: string, groupId: string | null) => {
    if (!groupId) return;
    let set = groupsByTeam.get(teamId);
    if (!set) {
      set = new Set();
      groupsByTeam.set(teamId, set);
    }
    set.add(groupId);
  };
  for (const member of members) {
    if (!groupsByTeam.has(member.team_id)) groupsByTeam.set(member.team_id, new Set());
    addGroup(member.team_id, member.app_group_id);
  }

  const memberIds = members.map((row) => row.id);
  if (memberIds.length > 0) {
    const { data: links } = await reader
      .from("entity_member_groups")
      .select("member_id, group_id")
      .in("member_id", memberIds);
    const teamByMember = new Map(members.map((row) => [row.id, row.team_id]));
    for (const link of links ?? []) {
      const teamId = teamByMember.get(asUuid((link as { member_id?: unknown }).member_id) ?? "");
      const groupId = asUuid((link as { group_id?: unknown }).group_id);
      if (teamId && groupId) addGroup(teamId, groupId);
    }
  }

  const memberships: MemberEntityMembership[] = teamIds.map((teamId) => {
    const groupIds = [...(groupsByTeam.get(teamId) ?? [])];
    return {
      teamId,
      name: nameByTeam.get(teamId) ?? "Entity",
      appGroupId: groupIds[0] ?? null,
      groupIds,
    };
  });

  const entitySessions: CalendarSessionRecord[] = [];
  if (teamIds.length > 0) {
    const queryIds = onlyEntityId ? [onlyEntityId] : teamIds;
    const { data, error } = await reader
      .from("calendar_sessions")
      .select("*")
      .in("entity_id", queryIds);
    if (error) console.error("[calendar visible] sessions by entity_id", error.message);
    for (const row of data ?? []) {
      const parsed = asSessionRow(row);
      if (!parsed) continue;
      if (admin && !sessionVisibleToMember(parsed, groupsByTeam)) continue;
      entitySessions.push(parsed);
    }
  }

  const personal: CalendarSessionRecord[] = [];
  if (!onlyEntityId) {
    const { data, error } = await reader
      .from("calendar_sessions")
      .select("*")
      .eq("user_id", ctx.user.id)
      .is("entity_id", null);
    if (error) console.error("[calendar visible] personal sessions", error.message);
    for (const row of data ?? []) {
      const parsed = asSessionRow(row);
      if (parsed) personal.push(parsed);
    }
  }

  return { memberships, sessions: mergeSessionLists(personal, entitySessions) };
}

async function loadPersonalCalendarOnly(
  ctx: AuthenticatedContext,
): Promise<VisibleCalendarPayload> {
  const userClient = await createUserSupabaseClient(ctx.accessToken, ctx.refreshToken);
  const admin = await getSupabaseAdminOrNull();
  const reader = admin ?? userClient;
  const sessions: CalendarSessionRecord[] = [];
  const { data, error } = await reader
    .from("calendar_sessions")
    .select("*")
    .eq("user_id", ctx.user.id)
    .is("entity_id", null);
  if (error) console.error("[calendar visible] personal-only sessions", error.message);
  for (const row of data ?? []) {
    const parsed = asSessionRow(row);
    if (parsed) sessions.push(parsed);
  }
  return { memberships: [], sessions };
}

function mergeVisible(
  fromTables: VisibleCalendarPayload,
  parsed: VisibleCalendarPayload,
): VisibleCalendarPayload {
  return {
    memberships: parsed.memberships.length > 0 ? parsed.memberships : fromTables.memberships,
    sessions: mergeSessionLists(fromTables.sessions, parsed.sessions),
  };
}

/** Personal sessions plus All/group-visible entity sessions for the cookie user. */
export async function loadVisibleCalendar(
  ctx: AuthenticatedContext,
): Promise<VisibleCalendarPayload> {
  /** Entity membership overlay — Bucket A+C: hidden unless entityCalendarSharing. */
  if (!(await entityFeatureAllowedForActor("entityCalendarSharing", ctx))) {
    return loadPersonalCalendarOnly(ctx);
  }
  const email = typeof ctx.user.email === "string" ? ctx.user.email : "";
  const fromTables = await loadSessionsByEntityMembership(ctx);
  const rpcArgs = { p_user_id: ctx.user.id, p_email: email };

  const admin = await getSupabaseAdminOrNull();
  if (admin) {
    const { data, error } = await admin.rpc("list_visible_calendar_sessions_for", rpcArgs);
    if (!error) return mergeVisible(fromTables, parseVisibleCalendar(data));
    console.error("[calendar visible] admin rpc", error.message);
  }

  const userClient = await createUserSupabaseClient(ctx.accessToken, ctx.refreshToken);
  // Cookie user id — do not depend on auth.uid() inside the wrapper RPC.
  const forRpc = await userClient.rpc("list_visible_calendar_sessions_for", rpcArgs);
  if (!forRpc.error) return mergeVisible(fromTables, parseVisibleCalendar(forRpc.data));
  console.error("[calendar visible] user rpc for", forRpc.error.message);

  const { data, error } = await userClient.rpc("list_visible_calendar_sessions");
  if (!error) return mergeVisible(fromTables, parseVisibleCalendar(data));
  console.error("[calendar visible] user rpc", error.message);

  return fromTables;
}

export async function loadEntitySessionsForMember(
  ctx: AuthenticatedContext,
  entityId: string,
): Promise<VisibleCalendarPayload> {
  /** Entity-sessions-by-team — Bucket A+C: empty unless entityCalendarSharing. */
  if (!(await entityFeatureAllowedForActor("entityCalendarSharing", ctx))) {
    return { memberships: [], sessions: [] };
  }
  const visible = await loadVisibleCalendar(ctx);
  const memberships = visible.memberships.filter((row) => row.teamId === entityId);
  const sessions = visible.sessions.filter((row) => sessionEntityId(row) === entityId);
  if (memberships.length > 0) return { memberships, sessions };
  return loadSessionsByEntityMembership(ctx, entityId);
}

/** @deprecated Use loadVisibleCalendar. Kept for membership-only callers. */
export async function loadMemberEntityCalendar(
  ctx: AuthenticatedContext,
): Promise<VisibleCalendarPayload> {
  return loadVisibleCalendar(ctx);
}
