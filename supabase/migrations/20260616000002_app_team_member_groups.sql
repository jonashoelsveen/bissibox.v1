-- Link team members to groups for roster filtering on the mobile team page.
ALTER TABLE public.app_team_members
  ADD COLUMN IF NOT EXISTS app_group_id uuid REFERENCES public.app_team_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS app_team_members_group_idx
  ON public.app_team_members (team_id, app_group_id);

NOTIFY pgrst, 'reload schema';
