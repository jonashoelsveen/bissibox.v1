-- calendar_sessions.sort_index is bigint. Entity upsert cast it to integer,
-- so Date.now() (~1.7e12) raised "integer out of range" and aborted every
-- entity write before the row existed for members to read.

CREATE OR REPLACE FUNCTION public.upsert_entity_calendar_session(p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  entity uuid;
  session_id uuid;
  session_group uuid;
  starts timestamptz;
  ends timestamptz;
  session_title text;
BEGIN
  IF uid IS NULL THEN
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

  IF NOT public.is_app_team_admin(entity) THEN
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
    uid,
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
      all_day = EXCLUDED.all_day,
      title = EXCLUDED.title,
      color = EXCLUDED.color,
      category = EXCLUDED.category,
      category_id = EXCLUDED.category_id,
      description = EXCLUDED.description,
      location = EXCLUDED.location,
      location_url = EXCLUDED.location_url,
      activity = EXCLUDED.activity,
      distance_km = EXCLUDED.distance_km,
      pace_sec_per_km = EXCLUDED.pace_sec_per_km,
      diary_type = EXCLUDED.diary_type,
      diary_group = EXCLUDED.diary_group,
      diary_sub = EXCLUDED.diary_sub,
      session_note = EXCLUDED.session_note,
      session_note_updated_at = EXCLUDED.session_note_updated_at,
      sort_index = EXCLUDED.sort_index,
      entity_id = entity,
      app_group_id = EXCLUDED.app_group_id,
      signup_enabled = EXCLUDED.signup_enabled,
      repeat_rule = EXCLUDED.repeat_rule,
      repeat_series_id = EXCLUDED.repeat_series_id
    WHERE public.is_app_team_admin(entity)
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

GRANT EXECUTE ON FUNCTION public.upsert_entity_calendar_session(jsonb)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
