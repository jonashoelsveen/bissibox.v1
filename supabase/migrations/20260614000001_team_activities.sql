-- Team-scoped activity categories (mobile app_teams) + shared calendar access for admins

CREATE OR REPLACE FUNCTION public.is_app_team_admin(p_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_teams t
    WHERE t.id = p_team_id AND t.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.app_team_admins a
    WHERE a.team_id = p_team_id
      AND a.status = 'active'
      AND (
        a.user_id = auth.uid()
        OR lower(a.email) = lower(coalesce(auth.jwt()->>'email', ''))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_app_team_admin(uuid) TO authenticated;

ALTER TABLE public.calendar_categories
  ADD COLUMN IF NOT EXISTS app_team_id uuid REFERENCES public.app_teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS app_group_id uuid REFERENCES public.app_team_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_calendar_categories_app_team
  ON public.calendar_categories (app_team_id, app_group_id, sort_order)
  WHERE app_team_id IS NOT NULL;

-- Admins (not only owner) can read team + groups for activity UI
CREATE POLICY "app_teams: admin select"
  ON public.app_teams FOR SELECT TO authenticated
  USING (public.is_app_team_admin(id));

CREATE POLICY "app_team_groups: admin select"
  ON public.app_team_groups FOR SELECT TO authenticated
  USING (public.is_app_team_admin(team_id));

-- Team activity categories — any active admin on the team
CREATE POLICY "calendar_categories: app team select"
  ON public.calendar_categories FOR SELECT TO authenticated
  USING (app_team_id IS NOT NULL AND public.is_app_team_admin(app_team_id));

CREATE POLICY "calendar_categories: app team insert"
  ON public.calendar_categories FOR INSERT TO authenticated
  WITH CHECK (app_team_id IS NOT NULL AND public.is_app_team_admin(app_team_id));

CREATE POLICY "calendar_categories: app team update"
  ON public.calendar_categories FOR UPDATE TO authenticated
  USING (app_team_id IS NOT NULL AND public.is_app_team_admin(app_team_id))
  WITH CHECK (app_team_id IS NOT NULL AND public.is_app_team_admin(app_team_id));

CREATE POLICY "calendar_categories: app team delete"
  ON public.calendar_categories FOR DELETE TO authenticated
  USING (
    app_team_id IS NOT NULL
    AND public.is_app_team_admin(app_team_id)
    AND is_default = false
  );

-- Shared team calendar sessions (entity_id = app_teams.id)
CREATE POLICY "cs: app team admin all"
  ON public.calendar_sessions FOR ALL TO authenticated
  USING (
    entity_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = calendar_sessions.entity_id)
    AND public.is_app_team_admin(entity_id)
  )
  WITH CHECK (
    entity_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = calendar_sessions.entity_id)
    AND public.is_app_team_admin(entity_id)
  );

-- Realtime sync across admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calendar_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_categories;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calendar_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_sessions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'app_team_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_team_groups;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
