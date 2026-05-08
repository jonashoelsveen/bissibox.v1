ALTER TABLE public.events ADD COLUMN folder text;
CREATE INDEX IF NOT EXISTS idx_events_folder ON public.events(folder);

CREATE TABLE IF NOT EXISTS public.event_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  team_id uuid,
  name text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "EventFolders: owner all"
ON public.event_folders FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "EventFolders: team owner all"
ON public.event_folders FOR ALL TO authenticated
USING (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM teams t WHERE t.id = event_folders.team_id AND t.owner_id = auth.uid()))
WITH CHECK (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM teams t WHERE t.id = event_folders.team_id AND t.owner_id = auth.uid()));

CREATE TRIGGER touch_event_folders
BEFORE UPDATE ON public.event_folders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();