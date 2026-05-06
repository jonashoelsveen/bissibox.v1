ALTER TABLE public.team_group_leaders ADD COLUMN IF NOT EXISTS group_id uuid;
CREATE INDEX IF NOT EXISTS idx_team_group_leaders_group_id ON public.team_group_leaders(group_id);