
CREATE TABLE public.team_board_meeting_attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid NOT NULL,
  team_id uuid NOT NULL,
  board_member_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, board_member_id)
);

CREATE INDEX idx_tbma_meeting ON public.team_board_meeting_attendance(meeting_id);

ALTER TABLE public.team_board_meeting_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attendance: owner all"
ON public.team_board_meeting_attendance
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_board_meeting_attendance.team_id AND t.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_board_meeting_attendance.team_id AND t.owner_id = auth.uid()));

CREATE POLICY "Attendance: board read"
ON public.team_board_meeting_attendance
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_board_meeting_attendance.team_id AND b.user_id = auth.uid() AND b.status = 'active'));
