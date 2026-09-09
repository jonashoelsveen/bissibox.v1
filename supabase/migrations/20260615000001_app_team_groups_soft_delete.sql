-- Soft-delete team groups so sessions keep app_group_id and archived groups can be resolved.
ALTER TABLE public.app_team_groups
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS app_team_groups_active_idx
  ON public.app_team_groups (team_id, sort_order)
  WHERE deleted_at IS NULL;
