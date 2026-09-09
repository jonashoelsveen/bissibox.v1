-- Parameterized member overlay: service-role / API pass the cookie user id.
-- Client JWT auth.uid() is not required, which is what made the overlay empty
-- when the HTTP session and supabase-js token disagreed.

CREATE OR REPLACE FUNCTION public.list_member_entity_calendar_for(
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

CREATE OR REPLACE FUNCTION public.list_member_entity_calendar()
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
  RETURN public.list_member_entity_calendar_for(
    auth.uid(),
    coalesce(auth.jwt()->>'email', '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_member_entity_calendar_for(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_member_entity_calendar_for(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.list_member_entity_calendar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_member_entity_calendar()
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
