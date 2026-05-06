ALTER TABLE public.team_group_meetings ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.team_groups(id) ON DELETE SET NULL;
ALTER TABLE public.team_group_meeting_roster ADD COLUMN IF NOT EXISTS is_leader boolean NOT NULL DEFAULT false;
ALTER TABLE public.team_group_meeting_roster ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS idx_team_group_meetings_group ON public.team_group_meetings(group_id);