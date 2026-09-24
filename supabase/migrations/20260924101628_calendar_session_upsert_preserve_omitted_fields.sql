-- Partial session edits must not null columns the payload omitted.
-- A core-only upsert (id, title, times) used to clear colour, repeat, notes,
-- and location on ON CONFLICT because missing jsonb keys became NULL.

CREATE OR REPLACE FUNCTION public.upsert_entity_calendar_session_for(p_actor uuid, p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity uuid;
  session_id uuid;
  session_group uuid;
  starts timestamptz;
  ends timestamptz;
  session_title text;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  entity := NULLIF(p->>'entity_id', '')::uuid;
  session_id := NULLIF(p->>'id', '')::uuid;
  starts := NULLIF(p->>'starts_at', '')::timestamptz;
  ends := NULLIF(p->>'ends_at', '')::timestamptz;
  session_title := NULLIF(btrim(COALESCE(p->>'title', '')), '');
  session_group := NULLIF(p->>'app_group_id', '')::uuid;

  IF entity IS NULL OR session_id IS NULL OR starts IS NULL OR ends IS NULL OR session_title IS NULL THEN
    RAISE EXCEPTION 'invalid entity session payload';
  END IF;

  IF NOT public.is_app_team_admin_for(p_actor, entity) THEN
    RAISE EXCEPTION 'not an entity admin';
  END IF;

  IF session_group IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.app_team_groups g
    WHERE g.id = session_group
      AND g.team_id = entity
      AND g.deleted_at IS NULL
  ) THEN
    session_group := NULL;
  END IF;

  INSERT INTO public.calendar_sessions (
    id,
    user_id,
    entity_id,
    starts_at,
    ends_at,
    all_day,
    title,
    color,
    category,
    category_id,
    description,
    location,
    location_url,
    activity,
    distance_km,
    pace_sec_per_km,
    diary_type,
    diary_group,
    diary_sub,
    session_note,
    session_note_updated_at,
    sort_index,
    app_group_id,
    signup_enabled,
    repeat_rule,
    repeat_series_id,
    created_by_coach_id,
    coach_pending
  )
  VALUES (
    session_id,
    p_actor,
    entity,
    starts,
    ends,
    COALESCE((p->>'all_day')::boolean, false),
    session_title,
    NULLIF(p->>'color', ''),
    NULLIF(p->>'category', ''),
    NULLIF(p->>'category_id', '')::uuid,
    NULLIF(p->>'description', ''),
    NULLIF(p->>'location', ''),
    NULLIF(p->>'location_url', ''),
    NULLIF(p->>'activity', ''),
    NULLIF(p->>'distance_km', '')::double precision,
    NULLIF(p->>'pace_sec_per_km', '')::double precision,
    NULLIF(p->>'diary_type', ''),
    NULLIF(p->>'diary_group', ''),
    NULLIF(p->>'diary_sub', ''),
    NULLIF(p->>'session_note', ''),
    NULLIF(p->>'session_note_updated_at', '')::timestamptz,
    NULLIF(p->>'sort_index', '')::bigint,
    session_group,
    COALESCE((p->>'signup_enabled')::boolean, false),
    NULLIF(p->>'repeat_rule', ''),
    NULLIF(p->>'repeat_series_id', '')::uuid,
    NULL,
    false
  )
  ON CONFLICT (id) DO UPDATE
    SET
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      all_day = CASE WHEN p ? 'all_day' THEN EXCLUDED.all_day ELSE calendar_sessions.all_day END,
      title = EXCLUDED.title,
      color = CASE WHEN p ? 'color' THEN EXCLUDED.color ELSE calendar_sessions.color END,
      category = CASE WHEN p ? 'category' THEN EXCLUDED.category ELSE calendar_sessions.category END,
      category_id = CASE WHEN p ? 'category_id' THEN EXCLUDED.category_id ELSE calendar_sessions.category_id END,
      description = CASE WHEN p ? 'description' THEN EXCLUDED.description ELSE calendar_sessions.description END,
      location = CASE WHEN p ? 'location' THEN EXCLUDED.location ELSE calendar_sessions.location END,
      location_url = CASE WHEN p ? 'location_url' THEN EXCLUDED.location_url ELSE calendar_sessions.location_url END,
      activity = CASE WHEN p ? 'activity' THEN EXCLUDED.activity ELSE calendar_sessions.activity END,
      distance_km = CASE WHEN p ? 'distance_km' THEN EXCLUDED.distance_km ELSE calendar_sessions.distance_km END,
      pace_sec_per_km = CASE WHEN p ? 'pace_sec_per_km' THEN EXCLUDED.pace_sec_per_km ELSE calendar_sessions.pace_sec_per_km END,
      diary_type = CASE WHEN p ? 'diary_type' THEN EXCLUDED.diary_type ELSE calendar_sessions.diary_type END,
      diary_group = CASE WHEN p ? 'diary_group' THEN EXCLUDED.diary_group ELSE calendar_sessions.diary_group END,
      diary_sub = CASE WHEN p ? 'diary_sub' THEN EXCLUDED.diary_sub ELSE calendar_sessions.diary_sub END,
      session_note = CASE WHEN p ? 'session_note' THEN EXCLUDED.session_note ELSE calendar_sessions.session_note END,
      session_note_updated_at = CASE WHEN p ? 'session_note_updated_at' THEN EXCLUDED.session_note_updated_at ELSE calendar_sessions.session_note_updated_at END,
      sort_index = CASE WHEN p ? 'sort_index' THEN EXCLUDED.sort_index ELSE calendar_sessions.sort_index END,
      entity_id = entity,
      app_group_id = CASE WHEN p ? 'app_group_id' THEN EXCLUDED.app_group_id ELSE calendar_sessions.app_group_id END,
      signup_enabled = CASE WHEN p ? 'signup_enabled' THEN EXCLUDED.signup_enabled ELSE calendar_sessions.signup_enabled END,
      repeat_rule = CASE WHEN p ? 'repeat_rule' THEN EXCLUDED.repeat_rule ELSE calendar_sessions.repeat_rule END,
      repeat_series_id = CASE WHEN p ? 'repeat_series_id' THEN EXCLUDED.repeat_series_id ELSE calendar_sessions.repeat_series_id END
    WHERE public.is_app_team_admin_for(p_actor, entity)
      AND (
        calendar_sessions.entity_id IS NOT DISTINCT FROM entity
        OR calendar_sessions.entity_id IS NULL
      );

  IF NOT EXISTS (
    SELECT 1
    FROM public.calendar_sessions cs
    WHERE cs.id = session_id
      AND cs.entity_id = entity
  ) THEN
    RAISE EXCEPTION 'entity session write failed';
  END IF;

  RETURN session_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
