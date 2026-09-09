-- Members (active + roster, user_id or email, All + group) must SELECT entity
-- sessions for overlay GET fallback and postgres_changes. Broadcast DELETE so
-- a member calendar drops a session as soon as the entity removes it.

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

DROP POLICY IF EXISTS "cs: entity member select" ON public.calendar_sessions;
CREATE POLICY "cs: entity member select"
  ON public.calendar_sessions
  FOR SELECT
  TO authenticated
  USING (
    entity_id IS NOT NULL
    AND public.can_view_entity_calendar_session(entity_id, app_group_id)
  );

DROP TRIGGER IF EXISTS calendar_sessions_broadcast_entity_sync_del ON public.calendar_sessions;
CREATE TRIGGER calendar_sessions_broadcast_entity_sync_del
  AFTER DELETE ON public.calendar_sessions
  FOR EACH ROW
  WHEN (OLD.entity_id IS NOT NULL)
  EXECUTE FUNCTION public.broadcast_entity_calendar_sync();

REVOKE ALL ON FUNCTION public.can_view_entity_calendar_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_entity_calendar_session(uuid, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
