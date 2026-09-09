-- Admin ↔ group assignments (mirrors entity_member_groups for roster admins).

CREATE TABLE IF NOT EXISTS public.entity_admin_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.app_teams(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES public.app_team_admins(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.app_team_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_id, group_id)
);

CREATE INDEX IF NOT EXISTS entity_admin_groups_team_idx
  ON public.entity_admin_groups (team_id);

CREATE INDEX IF NOT EXISTS entity_admin_groups_admin_idx
  ON public.entity_admin_groups (admin_id);

ALTER TABLE public.entity_admin_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_admin_groups: team owner all" ON public.entity_admin_groups;
CREATE POLICY "entity_admin_groups: team owner all" ON public.entity_admin_groups
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "entity_admin_groups: admin all" ON public.entity_admin_groups;
CREATE POLICY "entity_admin_groups: admin all" ON public.entity_admin_groups
  FOR ALL TO authenticated
  USING (public.is_app_team_admin(team_id))
  WITH CHECK (public.is_app_team_admin(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_admin_groups TO authenticated, service_role;

ALTER TABLE public.entity_admin_groups REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'entity_admin_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entity_admin_groups;
  END IF;
END $$;
