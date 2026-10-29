/**
 * jsonb payload for upsert_entity_calendar_session_for.
 * Matches the E2E insert (id, entity_id, title, starts_at, ends_at, all_day)
 * plus optional columns the RPC actually reads via p->>'…'.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCalendarUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function timestamptz(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function put(
  payload: Record<string, string | boolean>,
  key: string,
  value: string | null,
) {
  if (value != null) payload[key] = value;
}

export function entityCalendarSessionCorePayload(
  row: Record<string, unknown>,
  entityId: string,
): Record<string, string | boolean> | null {
  if (!isCalendarUuid(entityId)) return null;
  const id = isCalendarUuid(row.id) ? row.id : null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const startsAt = timestamptz(row.starts_at);
  const endsAt = timestamptz(row.ends_at);
  if (!id || !title || !startsAt || !endsAt) return null;
  return {
    id,
    entity_id: entityId,
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: row.all_day === true,
  };
}

export function entityCalendarSessionRpcPayload(
  row: Record<string, unknown>,
  entityId: string,
): Record<string, string | boolean> | null {
  const payload = entityCalendarSessionCorePayload(row, entityId);
  if (!payload) return null;

  put(payload, "color", text(row.color));
  put(payload, "category", text(row.category));
  put(payload, "category_id", isCalendarUuid(row.category_id) ? row.category_id : null);
  put(payload, "description", text(row.description));
  put(payload, "location", text(row.location));
  put(payload, "location_url", text(row.location_url));
  put(payload, "activity", text(row.activity));
  put(payload, "distance_km", text(row.distance_km));
  put(payload, "pace_sec_per_km", text(row.pace_sec_per_km));
  put(payload, "diary_type", text(row.diary_type));
  put(payload, "diary_group", text(row.diary_group));
  put(payload, "diary_sub", text(row.diary_sub));
  put(payload, "session_note", text(row.session_note));
  put(payload, "session_note_updated_at", timestamptz(row.session_note_updated_at));
  put(payload, "sort_index", text(row.sort_index));
  put(payload, "app_group_id", isCalendarUuid(row.app_group_id) ? row.app_group_id : null);
  if ("user_calendar_id" in row) {
    payload.user_calendar_id = isCalendarUuid(row.user_calendar_id) ? row.user_calendar_id : "";
  }
  if ("follows_calendar_color" in row) {
    payload.follows_calendar_color = row.follows_calendar_color === true ? "true" : "false";
  }
  if (row.signup_enabled === true) payload.signup_enabled = true;
  const repeatRuleRaw = row.repeat_rule ?? row.repeatRule;
  const repeatRule =
    typeof repeatRuleRaw === "string"
      ? text(repeatRuleRaw)
      : repeatRuleRaw && typeof repeatRuleRaw === "object"
        ? JSON.stringify(repeatRuleRaw)
        : null;
  put(payload, "repeat_rule", repeatRule);
  const seriesIdRaw = row.repeat_series_id ?? row.repeatSeriesId;
  put(
    payload,
    "repeat_series_id",
    isCalendarUuid(seriesIdRaw) ? seriesIdRaw : null,
  );
  return payload;
}
