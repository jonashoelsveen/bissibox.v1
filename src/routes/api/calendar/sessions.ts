import { createFileRoute } from "@tanstack/react-router";
import {
  createUserSupabaseClient,
  resolveAuthenticatedRequest,
} from "@/lib/account-auth.server";
import {
  assertCanImportToScope,
  parseImportCalId,
  type CalendarSessionInsert,
  type ImportScope,
} from "@/lib/calendarImport.server";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";
import { loadVisibleCalendar } from "@/lib/calendarMemberOverlay.server";
import { jsonSafeStringify } from "@/lib/calendarVisiblePayload";
import {
  entityCalendarSessionCorePayload,
  entityCalendarSessionRpcPayload,
} from "@/lib/calendarEntitySessionPayload";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return new Response(jsonSafeStringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asUuid(v: unknown): string | null {
  const s = asString(v);
  return s && UUID_RE.test(s) ? s : null;
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function applyScopeOwnership(
  row: CalendarSessionInsert,
  scope: ImportScope,
  actingUserId: string,
  incoming: Record<string, unknown>,
): CalendarSessionInsert {
  if (scope.kind === "team") {
    row.entity_id = scope.entityId;
    row.user_id = actingUserId;
    row.created_by_coach_id = null;
    row.coach_pending = false;
    return row;
  }

  if (scope.kind === "client") {
    row.user_id = scope.clientId;
    row.entity_id = null;
    if (scope.clientId !== actingUserId) {
      row.created_by_coach_id = actingUserId;
      row.coach_pending = asBool(incoming.coach_pending, true);
    } else {
      row.created_by_coach_id = asUuid(incoming.created_by_coach_id);
      row.coach_pending = asBool(incoming.coach_pending, false);
    }
    return row;
  }

  row.user_id = scope.userId;
  row.entity_id = null;
  row.created_by_coach_id = asUuid(incoming.created_by_coach_id);
  row.coach_pending = asBool(incoming.coach_pending, false);
  return row;
}

function sessionFromBody(
  incoming: Record<string, unknown>,
  scope: ImportScope,
  actingUserId: string,
): CalendarSessionInsert | null {
  const id = asUuid(incoming.id);
  const startsAt = asString(incoming.starts_at);
  const endsAt = asString(incoming.ends_at);
  const title = asString(incoming.title);
  if (!id || !startsAt || !endsAt || title == null || !title.trim()) return null;

  const row: CalendarSessionInsert = {
    id,
    user_id: actingUserId,
    starts_at: startsAt,
    ends_at: endsAt,
    title: title.trim(),
    all_day: asBool(incoming.all_day, false),
    color: asString(incoming.color),
    category: asString(incoming.category),
    category_id: asUuid(incoming.category_id),
    description: asString(incoming.description),
    location: asString(incoming.location),
    location_url: asString(incoming.location_url),
    activity: asString(incoming.activity),
    distance_km: asNumber(incoming.distance_km),
    pace_sec_per_km: asNumber(incoming.pace_sec_per_km),
    diary_type: asString(incoming.diary_type),
    diary_group: asString(incoming.diary_group),
    diary_sub: asString(incoming.diary_sub),
    session_note: asString(incoming.session_note),
    session_note_updated_at: asString(incoming.session_note_updated_at),
    activities: Array.isArray(incoming.activities) ? (incoming.activities as never) : null,
    strava_activity_id: asNumber(incoming.strava_activity_id),
    summary_polyline: asString(incoming.summary_polyline),
    total_elevation_gain_m: asNumber(incoming.total_elevation_gain_m),
    average_heartrate: asNumber(incoming.average_heartrate),
    sport_type: asString(incoming.sport_type),
    sub_type: asString(incoming.sub_type),
    sort_index: asNumber(incoming.sort_index),
    app_group_id: asUuid(incoming.app_group_id),
    signup_enabled: asBool(incoming.signup_enabled, false),
    repeat_rule: asString(incoming.repeat_rule),
    repeat_series_id: asUuid(incoming.repeat_series_id),
    user_calendar_id: asUuid(incoming.user_calendar_id),
    follows_calendar_color: asBool(incoming.follows_calendar_color, false),
  };

  return applyScopeOwnership(row, scope, actingUserId, incoming);
}

function stripFailingColumns(row: CalendarSessionInsert, message: string): CalendarSessionInsert {
  const next = { ...row } as Record<string, unknown>;
  if (/category_id/i.test(message)) delete next.category_id;
  if (/app_group_id/i.test(message)) delete next.app_group_id;
  if (/location_url/i.test(message)) delete next.location_url;
  if (/\blocation\b/i.test(message) && !/location_url/i.test(message)) delete next.location;
  if (/signup_enabled/i.test(message)) delete next.signup_enabled;
  if (/repeat_rule/i.test(message)) delete next.repeat_rule;
  if (/repeat_series_id/i.test(message)) delete next.repeat_series_id;
  if (/user_calendar_id/i.test(message)) delete next.user_calendar_id;
  if (/follows_calendar_color/i.test(message)) delete next.follows_calendar_color;
  return next as CalendarSessionInsert;
}

function logSessionWriteError(
  stage: string,
  error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
) {
  console.error("[calendar sessions write]", stage, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });
}

function minimalSessionRow(row: CalendarSessionInsert): CalendarSessionInsert {
  return {
    id: row.id,
    user_id: row.user_id,
    entity_id: row.entity_id ?? null,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    all_day: row.all_day ?? false,
    title: row.title,
    created_by_coach_id: row.created_by_coach_id ?? null,
    coach_pending: row.coach_pending ?? false,
  };
}

type SessionWriter = Awaited<ReturnType<typeof createUserSupabaseClient>>;

async function writeSessionRow(
  writer: SessionWriter,
  payload: CalendarSessionInsert,
  stage: string,
) {
  const id = payload.id;
  if (!id) return { message: "Missing id" };
  const { id: _id, ...patch } = payload;

  const updateExisting = async () =>
    writer.from("calendar_sessions").update(patch as never).eq("id", id).select("id").maybeSingle();

  const updated = await updateExisting();
  if (!updated.error && updated.data?.id) return null;

  const missing =
    updated.error?.code === "PGRST116" || (!updated.error && !updated.data);
  if (!missing && updated.error) {
    logSessionWriteError(`${stage}:update`, updated.error);
    return updated.error;
  }

  const insertResult = await writer
    .from("calendar_sessions")
    .insert(payload as never)
    .select("id")
    .maybeSingle();
  if (!insertResult.error && insertResult.data?.id) return null;

  if (insertResult.error?.code === "23505") {
    const retry = await updateExisting();
    if (!retry.error && retry.data?.id) return null;
    logSessionWriteError(`${stage}:update-after-conflict`, retry.error ?? insertResult.error);
    return retry.error ?? insertResult.error ?? { message: "Update not confirmed" };
  }

  logSessionWriteError(`${stage}:insert`, insertResult.error);
  return insertResult.error ?? { message: "Write not confirmed" };
}

async function handleUpsertRequest(request: Request): Promise<Response> {
  const auth = await resolveAuthenticatedRequest(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid request body" }, 400);
  }

  const { calId, session: rawSession } = body as {
    calId?: unknown;
    session?: unknown;
  };
  if (typeof calId !== "string" || !calId) {
    return json({ error: "calId is required" }, 400);
  }
  if (!rawSession || typeof rawSession !== "object") {
    return json({ error: "session is required" }, 400);
  }

  const scope = parseImportCalId(calId);
  if (!scope) return json({ error: "Invalid calId" }, 400);

  const userClient = await createUserSupabaseClient(
    auth.ctx.accessToken,
    auth.ctx.refreshToken,
  );
  const access = await assertCanImportToScope(userClient, auth.ctx.user.id, scope);
  if (!access.ok) return json({ error: access.error }, access.status);

  const row = sessionFromBody(
    rawSession as Record<string, unknown>,
    scope,
    auth.ctx.user.id,
  );
  if (!row) return json({ error: "Invalid session payload" }, 400);
  const persistedId = row.id;
  if (!persistedId) return json({ error: "Invalid session payload" }, 400);

  const admin = await getSupabaseAdminOrNull();

  if (scope.kind === "team") {
    row.entity_id = scope.entityId;
    const corePayload = entityCalendarSessionCorePayload(
      row as Record<string, unknown>,
      scope.entityId,
    );
    const rpcPayload = entityCalendarSessionRpcPayload(
      row as Record<string, unknown>,
      scope.entityId,
    );
    if (!corePayload) return json({ error: "Invalid entity session payload" }, 400);

    console.info("[calendar sessions write] entity", {
      hasServiceRole: Boolean(admin),
      entityId: scope.entityId,
    });

    const rpcMatches = (rpcId: unknown) =>
      rpcId != null && String(rpcId).toLowerCase() === persistedId.toLowerCase();

    const tryEntityRpc = async (
      payload: Record<string, string | boolean>,
      stage: string,
    ): Promise<boolean> => {
      if (admin) {
        const { data: rpcId, error: rpcError } = await admin.rpc(
          "upsert_entity_calendar_session_for",
          { p_actor: auth.ctx.user.id, p: payload as never },
        );
        if (!rpcError && rpcMatches(rpcId)) return true;
        if (rpcError) logSessionWriteError(`${stage}-for`, rpcError);
      }
      const { data: forId, error: forError } = await userClient.rpc(
        "upsert_entity_calendar_session_for",
        { p_actor: auth.ctx.user.id, p: payload as never },
      );
      if (!forError && rpcMatches(forId)) return true;
      if (forError) logSessionWriteError(`${stage}-for-user`, forError);
      const { data: rpcId, error: rpcError } = await userClient.rpc(
        "upsert_entity_calendar_session",
        { p: payload as never },
      );
      if (!rpcError && rpcMatches(rpcId)) return true;
      if (rpcError) logSessionWriteError(stage, rpcError);
      return false;
    };

    // Full payload only. A core-only upsert nulls colour, repeat, and notes
    // on conflict because omitted jsonb keys become NULL in the UPDATE.
    let wroteViaRpc = false;
    if (rpcPayload) {
      wroteViaRpc = await tryEntityRpc(rpcPayload, "entity-rpc-full");
    }
    if (!wroteViaRpc) {
      wroteViaRpc = await tryEntityRpc(corePayload, "entity-rpc-core");
    }

    const writer = admin ?? userClient;
    if (!wroteViaRpc) {
      let error = await writeSessionRow(writer, minimalSessionRow(row), "entity-minimal");
      if (error) {
        const msg = error.message || "";
        error = await writeSessionRow(writer, stripFailingColumns(row, msg), "entity-stripped");
      }
      if (error) {
        error = await writeSessionRow(writer, row, "entity-full");
      }
      if (error) {
        logSessionWriteError("entity-failed", error);
        const err = error as { message?: string; code?: string; details?: string };
        return json(
          {
            error: err.message || "Persist failed",
            code: err.code,
            details: err.details,
          },
          500,
        );
      }
    }

    const { data: stored, error: readBackError } = await writer
      .from("calendar_sessions")
      .select("id, entity_id")
      .eq("id", persistedId)
      .maybeSingle();
    const storedId =
      typeof stored?.id === "string" ? stored.id.toLowerCase() : "";
    const storedEntity =
      typeof stored?.entity_id === "string" ? stored.entity_id.toLowerCase() : "";
    if (storedId === persistedId.toLowerCase() && storedEntity === scope.entityId.toLowerCase()) {
      return json({ ok: true, id: persistedId, entity_id: scope.entityId });
    }
    if (wroteViaRpc) {
      logSessionWriteError(
        "entity-read-back",
        readBackError ?? { message: "RPC wrote; read-back skipped" },
      );
      return json({ ok: true, id: persistedId, entity_id: scope.entityId });
    }
    logSessionWriteError(
      "entity-read-back",
      readBackError ?? { message: "Entity session did not persist with entity_id" },
    );
    return json({ error: "Entity session did not persist with entity_id" }, 500);
  }

  const writer = admin ?? userClient;

  let error = await writeSessionRow(writer, row, "full");
  if (error) {
    const msg = error.message || "";
    error = await writeSessionRow(writer, stripFailingColumns(row, msg), "stripped");
  }
  if (error) {
    error = await writeSessionRow(writer, minimalSessionRow(row), "minimal");
  }

  if (error) {
    logSessionWriteError("failed", error);
    const err = error as { message?: string; code?: string; details?: string };
    return json(
      {
        error: err.message || "Persist failed",
        code: err.code,
        details: err.details,
      },
      500,
    );
  }

  const { data: stored, error: readBackError } = await writer
    .from("calendar_sessions")
    .select("id")
    .eq("id", persistedId)
    .maybeSingle();
  if (readBackError || stored?.id !== persistedId) {
    logSessionWriteError("read-back", readBackError ?? { message: "Inserted row not readable" });
    return json({ error: "Insert did not persist" }, 500);
  }

  return json({ ok: true, id: persistedId });
}

export const Route = createFileRoute("/api/calendar/sessions")({
  server: {
    handlers: {
      POST: async ({ request }) => handleUpsertRequest(request),
      PUT: async ({ request }) => handleUpsertRequest(request),

      GET: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const calId = new URL(request.url).searchParams.get("calId");
        if (!calId) return json({ error: "calId is required" }, 400);

        const scope = parseImportCalId(calId);
        if (!scope) return json({ error: "Invalid calId" }, 400);

        const userClient = await createUserSupabaseClient(
          auth.ctx.accessToken,
          auth.ctx.refreshToken,
        );
        const access = await assertCanImportToScope(userClient, auth.ctx.user.id, scope);
        if (!access.ok) return json({ error: access.error }, access.status);

        if (scope.kind === "user" && scope.userId === auth.ctx.user.id) {
          const visible = await loadVisibleCalendar(auth.ctx);
          return json({ sessions: visible.sessions, memberships: visible.memberships });
        }

        const reader = (await getSupabaseAdminOrNull()) ?? userClient;
        let query = reader.from("calendar_sessions").select("*");
        if (scope.kind === "team") query = query.eq("entity_id", scope.entityId);
        else query = query.eq("user_id", scope.clientId).is("entity_id", null);

        const { data, error } = await query;
        if (error) {
          logSessionWriteError("list", error);
          return json({ error: error.message || "Load failed" }, 500);
        }

        return json({ sessions: data ?? [], memberships: [] });
      },

      DELETE: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }
        if (!body || typeof body !== "object") {
          return json({ error: "Invalid request body" }, 400);
        }

        const { ids: rawIds } = body as { ids?: unknown };
        if (!Array.isArray(rawIds) || rawIds.length === 0) {
          return json({ error: "ids is required" }, 400);
        }
        if (rawIds.length > 500) {
          return json({ error: "Too many ids (max 500)" }, 400);
        }
        const ids = rawIds.filter((id): id is string => typeof id === "string" && UUID_RE.test(id));
        if (ids.length === 0) return json({ error: "ids is required" }, 400);

        const admin = await getSupabaseAdminOrNull();
        if (admin) {
          for (const id of ids) {
            const { error } = await admin.rpc("delete_entity_calendar_session_for", {
              p_actor: auth.ctx.user.id,
              p_id: id,
            });
            if (error) {
              logSessionWriteError("delete-for", error);
              return json({ error: error.message || "Delete failed" }, 500);
            }
          }
          return json({ ok: true, deleted: ids.length });
        }

        const supabase = await createUserSupabaseClient(
          auth.ctx.accessToken,
          auth.ctx.refreshToken,
        );
        const { error } = await supabase.from("calendar_sessions").delete().in("id", ids);
        if (error) {
          logSessionWriteError("delete", error);
          return json({ error: error.message || "Delete failed" }, 500);
        }
        return json({ ok: true, deleted: ids.length });
      },
    },
  },
});
