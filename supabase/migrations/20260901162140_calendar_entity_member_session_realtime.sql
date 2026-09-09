-- Entity calendar → member calendar:
--   * Visibility uses every matching entity_members row and entity_member_groups,
--     not a single DISTINCT ON app_group_id.
--   * Session writes broadcast on calendar-sessions-sync:{entity_id} so members
--     refresh without depending on the writer's client notify.

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
          m.user_id = uid
          OR (jwt_email <> '' AND lower(m.email) = jwt_email)
        )
    ),
    mine AS (
      SELECT
        team_id,
        MIN(name) AS name,
        (
          ARRAY_AGG(app_group_id ORDER BY (app_group_id IS NULL), member_id)
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
    session_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(cs) ORDER BY cs.starts_at), '[]'::jsonb) AS payload
      FROM public.calendar_sessions cs
      JOIN mine ON mine.team_id = cs.entity_id
      WHERE cs.app_group_id IS NULL
         OR EXISTS (
           SELECT 1
           FROM member_groups g
           WHERE g.team_id = cs.entity_id
             AND g.group_id = cs.app_group_id
         )
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
BEGIN
  IF p_entity_id IS NULL OR uid IS NULL THEN
    RETURN false;
  END IF;

  IF p_app_group_id IS NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.entity_members m
      WHERE m.team_id = p_entity_id
        AND m.status IN ('active', 'roster')
        AND (
          m.user_id = uid
          OR (jwt_email <> '' AND lower(m.email) = jwt_email)
        )
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.entity_members m
    WHERE m.team_id = p_entity_id
      AND m.status IN ('active', 'roster')
      AND (
        m.user_id = uid
        OR (jwt_email <> '' AND lower(m.email) = jwt_email)
      )
      AND (
        m.app_group_id IS NOT DISTINCT FROM p_app_group_id
        OR EXISTS (
          SELECT 1
          FROM public.entity_member_groups emg
          WHERE emg.member_id = m.id
            AND emg.group_id = p_app_group_id
        )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_app_team_member(p_team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.entity_members m
    WHERE m.team_id = p_team_id
      AND m.status IN ('active', 'roster')
      AND (
        m.user_id = auth.uid()
        OR (
          coalesce(auth.jwt()->>'email', '') <> ''
          AND lower(m.email) = lower(auth.jwt()->>'email')
        )
      )
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
  END IF;

  IF previous IS NOT NULL AND previous IS DISTINCT FROM entity THEN
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
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS calendar_sessions_broadcast_entity_sync ON public.calendar_sessions;
DROP TRIGGER IF EXISTS calendar_sessions_broadcast_entity_sync_ins ON public.calendar_sessions;
DROP TRIGGER IF EXISTS calendar_sessions_broadcast_entity_sync_del ON public.calendar_sessions;

CREATE TRIGGER calendar_sessions_broadcast_entity_sync_ins
  AFTER INSERT OR UPDATE ON public.calendar_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_entity_calendar_sync();

CREATE TRIGGER calendar_sessions_broadcast_entity_sync_del
  AFTER DELETE ON public.calendar_sessions
  FOR EACH ROW
  WHEN (OLD.entity_id IS NOT NULL)
  EXECUTE FUNCTION public.broadcast_entity_calendar_sync();

DROP TRIGGER IF EXISTS entity_members_broadcast_calendar_sync ON public.entity_members;
CREATE TRIGGER entity_members_broadcast_calendar_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.entity_members
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_entity_calendar_sync();

DROP TRIGGER IF EXISTS entity_member_groups_broadcast_calendar_sync ON public.entity_member_groups;
CREATE TRIGGER entity_member_groups_broadcast_calendar_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.entity_member_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_entity_calendar_sync();

CREATE INDEX IF NOT EXISTS calendar_sessions_entity_group_idx
  ON public.calendar_sessions (entity_id, app_group_id)
  WHERE entity_id IS NOT NULL;

GRANT EXECUTE ON FUNCTION public.list_member_entity_calendar() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_entity_calendar_session(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_app_team_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_entity_calendar_sync() TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
