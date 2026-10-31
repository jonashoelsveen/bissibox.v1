-- Members can read every session on a calendar they belong to. Writing stays
-- with admins. Leaving removes only the caller's membership.

DROP POLICY IF EXISTS "cs: calendar member select" ON public.calendar_sessions;

CREATE POLICY "cs: calendar member select"
  ON public.calendar_sessions FOR SELECT TO authenticated
  USING (
    user_calendar_id IS NOT NULL
    AND public.user_calendar_role(user_calendar_id) IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.leave_user_calendar(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_calendars c
    WHERE c.id = p_id
      AND c.owner_id = auth.uid()
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_calendar_members
  WHERE calendar_id = p_id
    AND user_id = auth.uid()
    AND status = 'accepted';

  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed = 0 THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_user_calendar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_user_calendar(uuid) TO authenticated;

-- The personal session list is what the calendar page loads first. Include
-- sessions on calendars this user can open, not only rows they authored.
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

  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'not authenticated';
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
      UNION
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
      UNION
      SELECT cs.*
      FROM public.calendar_sessions cs
      JOIN public.user_calendars c ON c.id = cs.user_calendar_id
      WHERE cs.user_calendar_id IS NOT NULL
        AND c.deleted_at IS NULL
        AND (
          c.owner_id = p_user_id
          OR EXISTS (
            SELECT 1
            FROM public.user_calendar_members m
            WHERE m.calendar_id = c.id
              AND m.user_id = p_user_id
              AND m.status = 'accepted'
          )
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

REVOKE ALL ON FUNCTION public.list_visible_calendar_sessions_for(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_visible_calendar_sessions_for(uuid, text)
  TO authenticated, service_role;
