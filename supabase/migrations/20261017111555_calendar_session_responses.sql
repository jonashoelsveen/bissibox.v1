-- A member's accept or cancel for a team session that has sign-up on.
-- The shared session stays unchanged. Pending is everyone in the audience
-- who has no row here.

CREATE TABLE IF NOT EXISTS public.calendar_session_responses (
  session_id uuid NOT NULL REFERENCES public.calendar_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('accepted', 'declined')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS calendar_session_responses_session_idx
  ON public.calendar_session_responses (session_id);

ALTER TABLE public.calendar_session_responses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_respond_to_calendar_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity uuid;
  session_group uuid;
  signup boolean;
  actor_email text;
  member_id uuid;
  member_group uuid;
BEGIN
  IF p_session_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.entity_id, s.app_group_id, s.signup_enabled
    INTO entity, session_group, signup
  FROM public.calendar_sessions s
  WHERE s.id = p_session_id;

  IF NOT FOUND OR entity IS NULL OR signup IS NOT TRUE THEN
    RETURN false;
  END IF;

  SELECT lower(u.email::text) INTO actor_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  SELECT m.id, m.app_group_id
    INTO member_id, member_group
  FROM public.entity_members m
  WHERE m.team_id = entity
    AND m.status IN ('active', 'roster')
    AND (
      m.user_id = auth.uid()
      OR (
        actor_email IS NOT NULL
        AND actor_email <> ''
        AND lower(m.email) = actor_email
      )
    )
  ORDER BY CASE WHEN m.user_id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1;

  IF member_id IS NULL THEN
    RETURN false;
  END IF;

  IF session_group IS NULL THEN
    RETURN true;
  END IF;

  IF member_group = session_group THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.entity_member_groups g
    WHERE g.member_id = member_id
      AND g.group_id = session_group
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_respond_to_calendar_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_respond_to_calendar_session(uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "csr: select own or team admin" ON public.calendar_session_responses;
CREATE POLICY "csr: select own or team admin"
  ON public.calendar_session_responses
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.calendar_sessions s
      WHERE s.id = session_id
        AND s.entity_id IS NOT NULL
        AND public.is_app_team_admin_for(auth.uid(), s.entity_id)
    )
  );

DROP POLICY IF EXISTS "csr: insert own" ON public.calendar_session_responses;
CREATE POLICY "csr: insert own"
  ON public.calendar_session_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_respond_to_calendar_session(session_id)
  );

DROP POLICY IF EXISTS "csr: update own" ON public.calendar_session_responses;
CREATE POLICY "csr: update own"
  ON public.calendar_session_responses
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.can_respond_to_calendar_session(session_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_respond_to_calendar_session(session_id)
  );

DROP POLICY IF EXISTS "csr: delete own" ON public.calendar_session_responses;
CREATE POLICY "csr: delete own"
  ON public.calendar_session_responses
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.can_respond_to_calendar_session(session_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_session_responses TO authenticated;
GRANT ALL ON public.calendar_session_responses TO service_role;

-- Team admins see every answer. A member sees their own, including when the
-- roster row is linked by email rather than user id.
CREATE OR REPLACE FUNCTION public.calendar_session_signup_roster(p_session_id uuid)
RETURNS TABLE (member_id uuid, user_id uuid, response text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, r.user_id, r.response
  FROM public.calendar_session_responses r
  JOIN public.calendar_sessions s ON s.id = r.session_id
  JOIN public.entity_members m
    ON m.team_id = s.entity_id
   AND m.status IN ('active', 'roster')
   AND (
     m.user_id = r.user_id
     OR (
       m.email IS NOT NULL
       AND btrim(m.email) <> ''
       AND lower(m.email) = (
         SELECT lower(u.email::text) FROM auth.users u WHERE u.id = r.user_id
       )
     )
   )
  WHERE r.session_id = p_session_id
    AND (
      r.user_id = auth.uid()
      OR (
        s.entity_id IS NOT NULL
        AND public.is_app_team_admin_for(auth.uid(), s.entity_id)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.calendar_session_signup_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calendar_session_signup_roster(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
