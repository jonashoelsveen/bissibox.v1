-- Add team association and event-level map pin to events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pin_lat double precision,
  ADD COLUMN IF NOT EXISTS pin_lng double precision,
  ADD COLUMN IF NOT EXISTS pin_description text;

CREATE INDEX IF NOT EXISTS idx_events_team ON public.events(team_id);

-- Meeting audience: which groups (and the board) of the owning team are invited
CREATE TABLE IF NOT EXISTS public.meeting_audience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  include_board boolean NOT NULL DEFAULT false,
  group_id uuid REFERENCES public.team_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, group_id),
  CHECK (include_board = true OR group_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_meeting_audience_event ON public.meeting_audience(event_id);

ALTER TABLE public.meeting_audience ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meeting audience: organizer manage"
ON public.meeting_audience
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid()));

CREATE POLICY "Meeting audience: read for event viewers"
ON public.meeting_audience
FOR SELECT
TO authenticated
USING (true);

-- Meeting email invites
CREATE TABLE IF NOT EXISTS public.meeting_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  invited_by uuid,
  UNIQUE (event_id, email)
);

CREATE INDEX IF NOT EXISTS idx_meeting_invites_event ON public.meeting_invites(event_id);

ALTER TABLE public.meeting_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meeting invites: organizer manage"
ON public.meeting_invites
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid()));

CREATE POLICY "Meeting invites: read for authenticated"
ON public.meeting_invites
FOR SELECT
TO authenticated
USING (true);
