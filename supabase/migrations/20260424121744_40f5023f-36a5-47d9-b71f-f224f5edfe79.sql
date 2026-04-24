-- Board members
CREATE TABLE public.team_board_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  user_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_board_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "BoardMembers: owner all"
ON public.team_board_members FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_board_members.team_id AND t.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_board_members.team_id AND t.owner_id = auth.uid()));

CREATE POLICY "BoardMembers: self read"
ON public.team_board_members FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER trg_team_board_members_updated_at
BEFORE UPDATE ON public.team_board_members
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Board meetings
CREATE TABLE public.team_board_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Board meeting',
  folder text,
  meeting_date date,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_board_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "BoardMeetings: owner all"
ON public.team_board_meetings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_board_meetings.team_id AND t.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_board_meetings.team_id AND t.owner_id = auth.uid()));

CREATE POLICY "BoardMeetings: board read"
ON public.team_board_meetings FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.team_board_members b
  WHERE b.team_id = team_board_meetings.team_id
    AND b.user_id = auth.uid()
    AND b.status = 'active'
));

CREATE TRIGGER trg_team_board_meetings_updated_at
BEFORE UPDATE ON public.team_board_meetings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Attachments
CREATE TABLE public.team_board_meeting_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.team_board_meetings(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_board_meeting_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "BoardAttachments: owner all"
ON public.team_board_meeting_attachments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_board_meeting_attachments.team_id AND t.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_board_meeting_attachments.team_id AND t.owner_id = auth.uid()));

CREATE POLICY "BoardAttachments: board read"
ON public.team_board_meeting_attachments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.team_board_members b
  WHERE b.team_id = team_board_meeting_attachments.team_id
    AND b.user_id = auth.uid()
    AND b.status = 'active'
));

-- Storage bucket for board attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('board-attachments', 'board-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Board attachments: owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = t.id::text
  )
);

CREATE POLICY "Board attachments: owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = t.id::text
  )
);

CREATE POLICY "Board attachments: owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = t.id::text
  )
);

CREATE POLICY "Board attachments: board read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'board-attachments'
  AND EXISTS (
    SELECT 1 FROM public.team_board_members b
    WHERE b.user_id = auth.uid()
      AND b.status = 'active'
      AND (storage.foldername(name))[1] = b.team_id::text
  )
);