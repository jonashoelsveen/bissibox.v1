-- Entity members may SELECT calendar_sessions they are entitled to see:
--   * app_group_id IS NULL  → "All" (every active member of the entity)
--   * otherwise             → only members whose roster group matches
--
-- Members remain read-only. Hide / colour overlay is a client preference.
-- Realtime (postgres_changes) uses the same SELECT policy.

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
  member_group uuid;
BEGIN
  IF p_entity_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT m.app_group_id
    INTO member_group
  FROM public.entity_members m
  WHERE m.team_id = p_entity_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
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

REVOKE ALL ON FUNCTION public.can_view_entity_calendar_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_entity_calendar_session(uuid, uuid)
  TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS entity_members_user_active_team_idx
  ON public.entity_members (user_id, team_id)
  WHERE user_id IS NOT NULL AND status = 'active';

DROP POLICY IF EXISTS "cs: entity member select" ON public.calendar_sessions;
CREATE POLICY "cs: entity member select"
  ON public.calendar_sessions
  FOR SELECT
  TO authenticated
  USING (
    entity_id IS NOT NULL
    AND public.can_view_entity_calendar_session(entity_id, app_group_id)
  );

NOTIFY pgrst, 'reload schema';
