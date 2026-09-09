-- Entity sessions must persist without auth.uid() (cloud uses the HTTP cookie).
-- Member calendars read personal rows UNION visible entity sessions in one query.
-- Broadcast must never abort the calendar_sessions write.

CREATE OR REPLACE FUNCTION public.is_app_team_admin_for(p_user_id uuid, p_team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_email text;
BEGIN
  IF p_user_id IS NULL OR p_team_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(u.email::text) INTO actor_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  RETURN EXISTS (
    SELECT 1
    FROM public.app_teams t
    WHERE t.id = p_team_id
      AND t.owner_id = p_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.app_team_admins a
    WHERE a.team_id = p_team_id
      AND a.status = 'active'
      AND (
        a.user_id = p_user_id
        OR (actor_email IS NOT NULL AND actor_email <> '' AND lower(a.email) = actor_email)
      )
  );
END;
$$;

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

CREATE OR REPLACE FUNCTION public.upsert_entity_calendar_session(p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN public.upsert_entity_calendar_session_for(auth.uid(), p);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_entity_calendar_session_for(p_actor uuid, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity uuid;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT entity_id INTO entity
  FROM public.calendar_sessions
  WHERE id = p_id;

  IF entity IS NULL THEN
    DELETE FROM public.calendar_sessions WHERE id = p_id AND user_id = p_actor;
    RETURN true;
  END IF;

  IF NOT public.is_app_team_admin_for(p_actor, entity) THEN
    RAISE EXCEPTION 'not an entity admin';
  END IF;

  DELETE FROM public.calendar_sessions WHERE id = p_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_entity_calendar_session(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN public.delete_entity_calendar_session_for(auth.uid(), p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_visible_calendar_sessions_for(
  p_user_id uuid,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_email text := lower(coalesce(nullif(btrim(p_email), ''), ''));
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('memberships', '[]'::jsonb, 'sessions', '[]'::jsonb);
  END IF;

  RETURN (
    WITH mine_rows AS (
      SELECT
        m.id AS member_id,
        m.team_id,
        m.app_group_id,
        COALESCE(NULLIF(btrim(t.name), ''), 'Entity') AS name
      FROM public.entity_members m
      JOIN public.app_teams t ON t.id = m.team_id
      WHERE m.status IN ('active', 'roster')
        AND (
          m.user_id = p_user_id
          OR (jwt_email <> '' AND lower(m.email) = jwt_email)
        )
    ),
    mine AS (
      SELECT
        team_id,
        MIN(name) AS name,
        (
          ARRAY_AGG(app_group_id ORDER BY member_id)
          FILTER (WHERE app_group_id IS NOT NULL)
        )[1] AS app_group_id
      FROM mine_rows
      GROUP BY team_id
    ),
    member_groups AS (
      SELECT mine_rows.team_id, mine_rows.app_group_id AS group_id
      FROM mine_rows
      WHERE mine_rows.app_group_id IS NOT NULL
      UNION
      SELECT mine_rows.team_id, emg.group_id
      FROM mine_rows
      JOIN public.entity_member_groups emg ON emg.member_id = mine_rows.member_id
    ),
    membership_json AS (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'teamId', mine.team_id,
            'name', mine.name,
            'appGroupId', mine.app_group_id,
            'groupIds', COALESCE((
              SELECT jsonb_agg(g.group_id ORDER BY g.group_id)
              FROM (
                SELECT DISTINCT member_groups.group_id
                FROM member_groups
                WHERE member_groups.team_id = mine.team_id
                  AND member_groups.group_id IS NOT NULL
              ) g
            ), '[]'::jsonb)
          )
          ORDER BY mine.name
        ),
        '[]'::jsonb
      ) AS payload
      FROM mine
    ),
    visible_sessions AS (
      SELECT cs.*
      FROM public.calendar_sessions cs
      WHERE cs.user_id = p_user_id
        AND cs.entity_id IS NULL
      UNION ALL
      SELECT cs.*
      FROM public.calendar_sessions cs
      JOIN mine ON mine.team_id = cs.entity_id
      WHERE cs.app_group_id IS NULL
         OR EXISTS (
           SELECT 1
           FROM member_groups g
           WHERE g.team_id = cs.entity_id
             AND g.group_id = cs.app_group_id
         )
    ),
    session_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(cs) ORDER BY cs.starts_at), '[]'::jsonb) AS payload
      FROM visible_sessions cs
    )
    SELECT jsonb_build_object(
      'memberships', (SELECT payload FROM membership_json),
      'sessions', (SELECT payload FROM session_json)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_visible_calendar_sessions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('memberships', '[]'::jsonb, 'sessions', '[]'::jsonb);
  END IF;
  RETURN public.list_visible_calendar_sessions_for(
    auth.uid(),
    coalesce(auth.jwt()->>'email', '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_entity_calendar_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity uuid;
  previous uuid;
BEGIN
  IF TG_TABLE_NAME = 'calendar_sessions' THEN
    entity := COALESCE(NEW.entity_id, OLD.entity_id);
    previous := CASE WHEN TG_OP = 'UPDATE' THEN OLD.entity_id ELSE NULL END;
  ELSIF TG_TABLE_NAME = 'entity_members' THEN
    entity := COALESCE(NEW.team_id, OLD.team_id);
    previous := CASE WHEN TG_OP = 'UPDATE' THEN OLD.team_id ELSE NULL END;
  ELSE
    entity := COALESCE(NEW.team_id, OLD.team_id);
    previous := CASE WHEN TG_OP = 'UPDATE' THEN OLD.team_id ELSE NULL END;
  END IF;

  IF entity IS NOT NULL THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object(
          'at', (extract(epoch FROM clock_timestamp()) * 1000)::bigint,
          'op', TG_OP,
          'table', TG_TABLE_NAME
        ),
        'sessions-changed',
        'calendar-sessions-sync:' || entity::text,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF previous IS NOT NULL AND previous IS DISTINCT FROM entity THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object(
          'at', (extract(epoch FROM clock_timestamp()) * 1000)::bigint,
          'op', TG_OP,
          'table', TG_TABLE_NAME
        ),
        'sessions-changed',
        'calendar-sessions-sync:' || previous::text,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS calendar_sessions_broadcast_entity_sync_ins ON public.calendar_sessions;
DROP TRIGGER IF EXISTS calendar_sessions_broadcast_entity_sync_upd ON public.calendar_sessions;
CREATE TRIGGER calendar_sessions_broadcast_entity_sync_ins
  AFTER INSERT ON public.calendar_sessions
  FOR EACH ROW
  WHEN (NEW.entity_id IS NOT NULL)
  EXECUTE FUNCTION public.broadcast_entity_calendar_sync();
CREATE TRIGGER calendar_sessions_broadcast_entity_sync_upd
  AFTER UPDATE ON public.calendar_sessions
  FOR EACH ROW
  WHEN (NEW.entity_id IS NOT NULL OR OLD.entity_id IS NOT NULL)
  EXECUTE FUNCTION public.broadcast_entity_calendar_sync();

REVOKE ALL ON FUNCTION public.is_app_team_admin_for(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_team_admin_for(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.upsert_entity_calendar_session_for(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_entity_calendar_session_for(uuid, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.delete_entity_calendar_session_for(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_entity_calendar_session_for(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.list_visible_calendar_sessions_for(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_visible_calendar_sessions_for(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.list_visible_calendar_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_visible_calendar_sessions()
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_entity_calendar_session(jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_entity_calendar_session(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
