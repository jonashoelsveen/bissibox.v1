-- Folders for organizing files
CREATE TABLE public.file_folders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  team_id uuid NULL,
  name text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.file_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Folders: owner read" ON public.file_folders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Folders: owner insert" ON public.file_folders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Folders: owner update" ON public.file_folders
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Folders: owner delete" ON public.file_folders
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Folders: team owner all" ON public.file_folders
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = file_folders.team_id AND t.owner_id = auth.uid()
  ))
  WITH CHECK (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = file_folders.team_id AND t.owner_id = auth.uid()
  ));

CREATE TRIGGER file_folders_touch
  BEFORE UPDATE ON public.file_folders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Files table
CREATE TABLE public.files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  team_id uuid NULL,
  folder_id uuid NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NULL,
  file_size bigint NULL,
  scan_status text NOT NULL DEFAULT 'pending',
  scan_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  scanned_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Files: owner read" ON public.files
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Files: owner insert" ON public.files
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Files: owner update" ON public.files
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Files: owner delete" ON public.files
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Files: team owner all" ON public.files
  FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = files.team_id AND t.owner_id = auth.uid()
  ))
  WITH CHECK (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = files.team_id AND t.owner_id = auth.uid()
  ));

CREATE TRIGGER files_touch
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- File ↔ folder many-to-many
CREATE TABLE public.file_folder_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id uuid NOT NULL,
  folder_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, folder_id)
);

ALTER TABLE public.file_folder_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FileFolderLinks: owner read" ON public.file_folder_links
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_folder_links.file_id AND f.user_id = auth.uid()));
CREATE POLICY "FileFolderLinks: owner insert" ON public.file_folder_links
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_folder_links.file_id AND f.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.file_folders fo WHERE fo.id = file_folder_links.folder_id AND (
      fo.user_id = auth.uid()
      OR (fo.team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = fo.team_id AND t.owner_id = auth.uid()))
    ))
  );
CREATE POLICY "FileFolderLinks: owner delete" ON public.file_folder_links
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_folder_links.file_id AND f.user_id = auth.uid()));

-- Documents storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Documents: owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Documents: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Documents: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Documents: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);