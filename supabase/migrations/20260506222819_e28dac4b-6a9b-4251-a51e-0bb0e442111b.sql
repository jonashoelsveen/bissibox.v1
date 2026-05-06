
-- team_group_meetings
CREATE TABLE public.team_group_meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Group meeting',
  folder TEXT,
  meeting_date DATE,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_group_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "GroupMeetings: team owner all" ON public.team_group_meetings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_meetings.team_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_meetings.team_id AND t.owner_id = auth.uid()));
CREATE TRIGGER trg_team_group_meetings_updated_at BEFORE UPDATE ON public.team_group_meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- team_group_meeting_folders
CREATE TABLE public.team_group_meeting_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL,
  name TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_group_meeting_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "GroupMeetingFolders: team owner all" ON public.team_group_meeting_folders
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_meeting_folders.team_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_meeting_folders.team_id AND t.owner_id = auth.uid()));
CREATE TRIGGER trg_team_group_meeting_folders_updated_at BEFORE UPDATE ON public.team_group_meeting_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- team_group_meeting_attachments
CREATE TABLE public.team_group_meeting_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL,
  team_id UUID NOT NULL,
  uploaded_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_group_meeting_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "GroupAttachments: team owner all" ON public.team_group_meeting_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_meeting_attachments.team_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_meeting_attachments.team_id AND t.owner_id = auth.uid()));

-- team_group_meeting_roster
CREATE TABLE public.team_group_meeting_roster (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL,
  team_id UUID NOT NULL,
  board_member_id UUID,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_group_meeting_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "GroupRoster: team owner all" ON public.team_group_meeting_roster
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_meeting_roster.team_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_meeting_roster.team_id AND t.owner_id = auth.uid()));

-- team_group_meeting_attendance
CREATE TABLE public.team_group_meeting_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL,
  team_id UUID NOT NULL,
  board_member_id UUID NOT NULL,
  roster_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_group_meeting_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "GroupAttendance: team owner all" ON public.team_group_meeting_attendance
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_meeting_attendance.team_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_meeting_attendance.team_id AND t.owner_id = auth.uid()));
