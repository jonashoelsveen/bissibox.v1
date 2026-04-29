CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.meeting_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL,
  name text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "MeetingFolders: team owner all"
ON public.meeting_folders
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM teams t WHERE t.id = meeting_folders.team_id AND t.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM teams t WHERE t.id = meeting_folders.team_id AND t.owner_id = auth.uid()));

CREATE POLICY "MeetingFolders: board read"
ON public.meeting_folders
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM team_board_members b WHERE b.team_id = meeting_folders.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE TRIGGER update_meeting_folders_updated_at
BEFORE UPDATE ON public.meeting_folders
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_now();

CREATE UNIQUE INDEX meeting_folders_team_name_unique ON public.meeting_folders(team_id, name);

-- Backfill folders from existing meetings
INSERT INTO public.meeting_folders (team_id, name)
SELECT DISTINCT team_id, folder
FROM public.team_board_meetings
WHERE folder IS NOT NULL
ON CONFLICT DO NOTHING;