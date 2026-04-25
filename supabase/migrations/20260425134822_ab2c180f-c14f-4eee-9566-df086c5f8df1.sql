-- Snapshot of board roster at the time a meeting was created
CREATE TABLE public.team_board_meeting_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL,
  team_id uuid NOT NULL,
  board_member_id uuid,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tbm_roster_meeting ON public.team_board_meeting_roster(meeting_id);

ALTER TABLE public.team_board_meeting_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Roster: owner all"
ON public.team_board_meeting_roster
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM teams t WHERE t.id = team_board_meeting_roster.team_id AND t.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM teams t WHERE t.id = team_board_meeting_roster.team_id AND t.owner_id = auth.uid()));

CREATE POLICY "Roster: board read"
ON public.team_board_meeting_roster
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM team_board_members b
  WHERE b.team_id = team_board_meeting_roster.team_id
    AND b.user_id = auth.uid()
    AND b.status = 'active'
));

-- Add a roster_id to attendance so attendance points to a snapshot entry,
-- preserving who attended even if the live board member is deleted.
ALTER TABLE public.team_board_meeting_attendance
  ADD COLUMN roster_id uuid;

CREATE INDEX idx_tbm_attendance_roster ON public.team_board_meeting_attendance(roster_id);