-- Break RLS recursion on app_teams.
--
-- `app_teams: admin select` called LANGUAGE sql `is_app_team_admin`, which
-- Postgres inlines (dropping SECURITY DEFINER) into a self-select on app_teams.
-- `app_teams: member select own` EXISTS-scans entity_members, whose owner policy
-- selects app_teams again. INSERT ... RETURNING evaluates those SELECT policies
-- and fails with "infinite recursion detected in policy for relation app_teams".

CREATE OR REPLACE FUNCTION public.is_app_team_owner(p_team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.app_teams t
    WHERE t.id = p_team_id
      AND t.owner_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_app_team_admin(p_team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.is_app_team_owner(p_team_id)
    OR EXISTS (
      SELECT 1
      FROM public.app_team_admins a
      WHERE a.team_id = p_team_id
        AND a.status = 'active'
        AND (
          a.user_id = auth.uid()
          OR lower(a.email) = lower(coalesce(auth.jwt()->>'email', ''))
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
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_app_team_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_app_team_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_app_team_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_team_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_app_team_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_app_team_member(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "app_teams: admin select" ON public.app_teams;
CREATE POLICY "app_teams: admin select"
  ON public.app_teams FOR SELECT TO authenticated
  USING (public.is_app_team_admin(id));

DROP POLICY IF EXISTS "app_teams: member select own" ON public.app_teams;
CREATE POLICY "app_teams: member select own"
  ON public.app_teams FOR SELECT TO authenticated
  USING (public.is_app_team_member(id));

NOTIFY pgrst, 'reload schema';
