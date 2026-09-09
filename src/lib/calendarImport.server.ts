/**
 * Server helpers for calendar import confirm (scope + row mapping).
 */

import type { ImportedSession } from "@/lib/calendarImportParse";
import { composeImportSessionTitle } from "@/lib/calendarImportParse";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";

const CAL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ImportScope =
  | { kind: "user"; userId: string }
  | { kind: "team"; entityId: string }
  | { kind: "client"; clientId: string };

function scopedUuid(prefix: string, calId: string): string | null {
  if (!calId.startsWith(prefix)) return null;
  const id = calId.slice(prefix.length);
  return CAL_UUID_RE.test(id) ? id : null;
}

export function parseImportCalId(calId: string): ImportScope | null {
  const userId = scopedUuid("user:", calId) ?? scopedUuid("diary:user:", calId);
  if (userId) return { kind: "user", userId };
  const entityId = scopedUuid("team:", calId) ?? scopedUuid("diary:team:", calId);
  if (entityId) return { kind: "team", entityId };
  const clientId = scopedUuid("client:", calId) ?? scopedUuid("diary:client:", calId);
  if (clientId) return { kind: "client", clientId };
  return null;
}

/** Local ISO → timestamptz string matching yearStore isoToDb. */
export function importIsoToDb(s: string): string {
  if (!s) return s;
  if (/[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) return s;
  return s + "Z";
}

type UserClient = SupabaseClient<Database>;

export async function assertCanImportToScope(
  supabase: UserClient,
  userId: string,
  scope: ImportScope,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (scope.kind === "user") {
    if (scope.userId !== userId) {
      return { ok: false, status: 403, error: "Cannot import into another user's calendar" };
    }
    return { ok: true };
  }

  if (scope.kind === "client") {
    if (scope.clientId === userId) return { ok: true };
    const { data: isCoach, error } = await supabase.rpc("is_coach_of_member", {
      _member: scope.clientId,
    });
    if (error) {
      console.error("[calendar import] is_coach_of_member", error);
      return { ok: false, status: 500, error: "Could not verify coach access" };
    }
    if (isCoach) return { ok: true };
    return { ok: false, status: 403, error: "Cannot import into this client calendar" };
  }

  // team — owner or app-team admin (cookie user, not only auth.uid())
  const admin = await getSupabaseAdminOrNull();
  if (admin) {
    const { data: allowed } = await admin.rpc("is_app_team_admin_for", {
      p_user_id: userId,
      p_team_id: scope.entityId,
    });
    if (allowed === true) return { ok: true };
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_app_team_admin", {
    p_team_id: scope.entityId,
  });
  if (!adminErr && isAdmin) return { ok: true };

  const teamReader = admin ?? supabase;
  const { data: team } = await teamReader
    .from("app_teams")
    .select("id, owner_id")
    .eq("id", scope.entityId)
    .maybeSingle();
  if (!team) return { ok: false, status: 404, error: "Team not found" };
  if (team.owner_id === userId) return { ok: true };

  const { data: adminLink } = await teamReader
    .from("app_team_admins")
    .select("team_id")
    .eq("team_id", scope.entityId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (adminLink?.team_id) return { ok: true };

  return { ok: false, status: 403, error: "Cannot import into this team calendar" };
}

export type CalendarSessionInsert = Database["public"]["Tables"]["calendar_sessions"]["Insert"];

export function sessionsToInsertRows(
  sessions: ImportedSession[],
  scope: ImportScope,
  actingUserId: string,
): CalendarSessionInsert[] {
  const nowSort = Date.now();
  return sessions.map((s, i) => {
    // Prefer the preview title verbatim so confirm matches what the user saw.
    const title =
      s.title.trim() ||
      composeImportSessionTitle(s.teachingTitle, s.summary, s.title).trim();
    const base: CalendarSessionInsert = {
      user_id: actingUserId,
      title,
      starts_at: importIsoToDb(s.startISO),
      ends_at: importIsoToDb(s.endISO),
      all_day: false,
      color: s.color?.trim() || "#ADD8E6",
      location: s.location?.trim() || null,
      location_url: s.locationUrl?.trim() || null,
      description: s.description ?? null,
      sort_index: nowSort + i,
      coach_pending: false,
      entity_id: null,
    };

    if (scope.kind === "team") {
      base.entity_id = scope.entityId;
      base.user_id = actingUserId;
    } else if (scope.kind === "client") {
      base.user_id = scope.clientId;
      base.entity_id = null;
      if (scope.clientId !== actingUserId) {
        base.created_by_coach_id = actingUserId;
        base.coach_pending = true;
      }
    } else {
      base.user_id = scope.userId;
      base.entity_id = null;
    }

    return base;
  });
}

