-- Recover categories misfiled with app_teams.id in legacy team_id column
UPDATE public.calendar_categories c
SET app_team_id = c.team_id, team_id = NULL
WHERE c.app_team_id IS NULL
  AND c.team_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = c.team_id);

-- Team sessions can be scoped to a group (null = whole team)
ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS app_group_id uuid REFERENCES public.app_team_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_sessions_app_group
  ON public.calendar_sessions (entity_id, app_group_id, starts_at)
  WHERE entity_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
