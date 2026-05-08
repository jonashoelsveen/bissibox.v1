
-- FIX 2a: invite token
ALTER TABLE public.team_group_leaders ADD COLUMN invite_token text NULL;
ALTER TABLE public.team_group_leaders ADD CONSTRAINT team_group_leaders_invite_token_unique UNIQUE (invite_token);

-- FIX 3: board-member ALL policies on team-scoped tables
CREATE POLICY "FileFolders: active board member all" ON public.file_folders
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = file_folders.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = file_folders.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "Files: active board member all" ON public.files
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = files.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = files.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamGroups: active board member all" ON public.team_groups
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_groups.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_groups.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamGroupMembers: active board member all" ON public.team_group_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_members.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_members.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamBoardMeetings: active board member all" ON public.team_board_meetings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_board_meetings.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_board_meetings.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamBoardMeetingAttachments: active board member all" ON public.team_board_meeting_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_board_meeting_attachments.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_board_meeting_attachments.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamBoardMeetingRoster: active board member all" ON public.team_board_meeting_roster
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_board_meeting_roster.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_board_meeting_roster.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamBoardMeetingAttendance: active board member all" ON public.team_board_meeting_attendance
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_board_meeting_attendance.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_board_meeting_attendance.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamGroupMeetings: active board member all" ON public.team_group_meetings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_meetings.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_meetings.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamGroupMeetingFolders: active board member all" ON public.team_group_meeting_folders
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_meeting_folders.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_meeting_folders.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamGroupMeetingAttachments: active board member all" ON public.team_group_meeting_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_meeting_attachments.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_meeting_attachments.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamGroupMeetingRoster: active board member all" ON public.team_group_meeting_roster
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_meeting_roster.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_meeting_roster.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamGroupMeetingAttendance: active board member all" ON public.team_group_meeting_attendance
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_meeting_attendance.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_meeting_attendance.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "TeamGroupLeaders: active board member all" ON public.team_group_leaders
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_leaders.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_leaders.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "MediaAlbums: active board member all" ON public.media_albums
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = media_albums.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = media_albums.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "NoteFolders: active board member all" ON public.note_folders
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = note_folders.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = note_folders.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "Notes: active board member all" ON public.notes
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = notes.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = notes.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "NoteAttachments: active board member all" ON public.note_attachments
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = note_attachments.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = note_attachments.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

CREATE POLICY "MeetingFolders: active board member all" ON public.meeting_folders
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = meeting_folders.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = meeting_folders.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

-- Storage bucket policies for active board members
CREATE POLICY "BoardAttachmentsStorage: active board member select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'board-attachments' AND EXISTS (
    SELECT 1 FROM public.team_board_members b
    WHERE b.user_id = auth.uid() AND b.status = 'active'
      AND (storage.foldername(name))[1] = b.team_id::text
  ));

CREATE POLICY "BoardAttachmentsStorage: active board member insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'board-attachments' AND EXISTS (
    SELECT 1 FROM public.team_board_members b
    WHERE b.user_id = auth.uid() AND b.status = 'active'
      AND (storage.foldername(name))[1] = b.team_id::text
  ));

CREATE POLICY "BoardAttachmentsStorage: active board member delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'board-attachments' AND EXISTS (
    SELECT 1 FROM public.team_board_members b
    WHERE b.user_id = auth.uid() AND b.status = 'active'
      AND (storage.foldername(name))[1] = b.team_id::text
  ));

CREATE POLICY "DocumentsStorage: active board member select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND EXISTS (
    SELECT 1 FROM public.team_board_members b
    WHERE b.user_id = auth.uid() AND b.status = 'active'
      AND (storage.foldername(name))[1] = b.team_id::text
  ));

CREATE POLICY "DocumentsStorage: active board member insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND EXISTS (
    SELECT 1 FROM public.team_board_members b
    WHERE b.user_id = auth.uid() AND b.status = 'active'
      AND (storage.foldername(name))[1] = b.team_id::text
  ));

CREATE POLICY "DocumentsStorage: active board member delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND EXISTS (
    SELECT 1 FROM public.team_board_members b
    WHERE b.user_id = auth.uid() AND b.status = 'active'
      AND (storage.foldername(name))[1] = b.team_id::text
  ));
