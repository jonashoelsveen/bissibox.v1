-- Allow active team admins (including owner via is_app_team_admin) to manage groups.
DROP POLICY IF EXISTS "app_team_groups: admin insert" ON public.app_team_groups;
CREATE POLICY "app_team_groups: admin insert"
  ON public.app_team_groups FOR INSERT TO authenticated
  WITH CHECK (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_groups: admin update" ON public.app_team_groups;
CREATE POLICY "app_team_groups: admin update"
  ON public.app_team_groups FOR UPDATE TO authenticated
  USING (public.is_app_team_admin(team_id))
  WITH CHECK (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_groups: admin delete" ON public.app_team_groups;
CREATE POLICY "app_team_groups: admin delete"
  ON public.app_team_groups FOR DELETE TO authenticated
  USING (public.is_app_team_admin(team_id));
