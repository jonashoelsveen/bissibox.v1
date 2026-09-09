-- Events are scoped to entity workspaces (`app_teams`), not legacy `teams`.
-- Creating an event while an entity is active sets team_id = activeEntityId
-- (an app_teams id), which violated events_team_id_fkey → teams(id).

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_team_id_fkey;

-- Drop any team_id values that are not valid app_teams rows so the new FK can apply.
UPDATE public.events e
SET team_id = NULL
WHERE e.team_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.app_teams t WHERE t.id = e.team_id
  );

ALTER TABLE public.events
  ADD CONSTRAINT events_team_id_fkey
  FOREIGN KEY (team_id)
  REFERENCES public.app_teams(id)
  ON DELETE SET NULL;

COMMENT ON CONSTRAINT events_team_id_fkey ON public.events IS
  'Entity workspace that owns the event (app_teams).';
