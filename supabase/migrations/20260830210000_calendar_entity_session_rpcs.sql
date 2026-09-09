-- Entity calendar sessions: write/read via SECURITY DEFINER RPCs so members
-- do not depend on table RLS or a service-role key.
--
-- upsert_entity_calendar_session: team admin insert/update (bypasses RLS).
-- list_member_entity_calendar: active members see All (app_group_id IS NULL)
--   plus sessions in their roster group.

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
    NULLIF(p->>'sort_index', '')::integer,
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
      app_group_id = EXCLUDED.app_group_id,
      signup_enabled = EXCLUDED.signup_enabled,
      repeat_rule = EXCLUDED.repeat_rule,
      repeat_series_id = EXCLUDED.repeat_series_id
    WHERE calendar_sessions.entity_id = entity
      AND public.is_app_team_admin(calendar_sessions.entity_id);

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

CREATE OR REPLACE FUNCTION public.delete_entity_calendar_session(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT entity_id INTO entity
  FROM public.calendar_sessions
  WHERE id = p_id;

  IF entity IS NULL THEN
    RETURN true;
  END IF;

  IF NOT public.is_app_team_admin(entity) THEN
    RAISE EXCEPTION 'not an entity admin';
  END IF;

  DELETE FROM public.calendar_sessions WHERE id = p_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_member_entity_calendar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  jwt_email text := lower(coalesce(auth.jwt()->>'email', ''));
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('memberships', '[]'::jsonb, 'sessions', '[]'::jsonb);
  END IF;

  RETURN (
    WITH mine AS (
      SELECT DISTINCT ON (m.team_id)
        m.team_id,
        m.app_group_id,
        COALESCE(NULLIF(btrim(t.name), ''), 'Entity') AS name
      FROM public.entity_members m
      JOIN public.app_teams t ON t.id = m.team_id
      WHERE m.status = 'active'
        AND (
          m.user_id = uid
          OR (jwt_email <> '' AND lower(m.email) = jwt_email)
        )
      ORDER BY m.team_id, (m.user_id IS NOT NULL) DESC
    ),
    membership_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'teamId', mine.team_id,
            'name', mine.name,
            'appGroupId', mine.app_group_id
          )
          ORDER BY mine.name
        ),
        '[]'::jsonb
      ) AS payload
      FROM mine
    ),
    session_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(cs) ORDER BY cs.starts_at), '[]'::jsonb) AS payload
      FROM public.calendar_sessions cs
      JOIN mine ON mine.team_id = cs.entity_id
      WHERE cs.app_group_id IS NULL
         OR cs.app_group_id = mine.app_group_id
    )
    SELECT jsonb_build_object(
      'memberships', (SELECT payload FROM membership_json),
      'sessions', (SELECT payload FROM session_json)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_entity_calendar_session(
  p_entity_id uuid,
  p_app_group_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  jwt_email text := lower(coalesce(auth.jwt()->>'email', ''));
  member_group uuid;
BEGIN
  IF p_entity_id IS NULL OR uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT m.app_group_id
    INTO member_group
  FROM public.entity_members m
  WHERE m.team_id = p_entity_id
    AND m.status = 'active'
    AND (
      m.user_id = uid
      OR (jwt_email <> '' AND lower(m.email) = jwt_email)
    )
  ORDER BY (m.user_id IS NOT NULL) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_app_group_id IS NULL THEN
    RETURN true;
  END IF;

  RETURN member_group IS NOT NULL AND member_group = p_app_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_entity_calendar_session(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_entity_calendar_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_member_entity_calendar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_entity_calendar_session(jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_entity_calendar_session(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_member_entity_calendar()
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
