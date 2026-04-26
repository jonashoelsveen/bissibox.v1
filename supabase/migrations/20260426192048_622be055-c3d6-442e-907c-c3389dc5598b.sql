-- Notes feature: per-user (and optionally per-team) notes with folders + attachments

CREATE TABLE public.notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  team_id uuid NULL,
  title text NOT NULL DEFAULT 'Untitled note',
  folder text NULL,
  body text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notes: owner all"
ON public.notes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Notes: team owner all"
ON public.notes
FOR ALL
TO authenticated
USING (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = notes.team_id AND t.owner_id = auth.uid()))
WITH CHECK (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = notes.team_id AND t.owner_id = auth.uid()));

CREATE TRIGGER update_notes_updated_at
BEFORE UPDATE ON public.notes
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_notes_user ON public.notes(user_id);
CREATE INDEX idx_notes_team ON public.notes(team_id);

-- Attachments
CREATE TABLE public.note_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  team_id uuid NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NULL,
  file_size bigint NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.note_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "NoteAttachments: owner all"
ON public.note_attachments
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "NoteAttachments: team owner all"
ON public.note_attachments
FOR ALL
TO authenticated
USING (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = note_attachments.team_id AND t.owner_id = auth.uid()))
WITH CHECK (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = note_attachments.team_id AND t.owner_id = auth.uid()));

CREATE INDEX idx_note_attachments_note ON public.note_attachments(note_id);

-- Note folders (separate from file_folders/media_albums to keep concerns clean)
CREATE TABLE public.note_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  team_id uuid NULL,
  name text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.note_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "NoteFolders: owner all"
ON public.note_folders
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "NoteFolders: team owner all"
ON public.note_folders
FOR ALL
TO authenticated
USING (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = note_folders.team_id AND t.owner_id = auth.uid()))
WITH CHECK (team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = note_folders.team_id AND t.owner_id = auth.uid()));

CREATE TRIGGER update_note_folders_updated_at
BEFORE UPDATE ON public.note_folders
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_note_folders_user ON public.note_folders(user_id);
CREATE INDEX idx_note_folders_team ON public.note_folders(team_id);

-- Storage bucket for note attachments (reuse existing 'documents' bucket would also work,
-- but a dedicated bucket keeps RLS scoped). Create a new 'note-attachments' bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('note-attachments', 'note-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "NoteAttachmentObjects: owner read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'note-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "NoteAttachmentObjects: owner insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'note-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "NoteAttachmentObjects: owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'note-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
