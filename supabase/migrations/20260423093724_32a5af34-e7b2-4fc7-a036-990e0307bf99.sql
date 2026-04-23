-- Albums
CREATE TABLE public.media_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.media_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Albums: owner read" ON public.media_albums FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Albums: owner insert" ON public.media_albums FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Albums: owner update" ON public.media_albums FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Albums: owner delete" ON public.media_albums FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_media_albums_updated
BEFORE UPDATE ON public.media_albums
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Media items
CREATE TABLE public.media_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  album_id UUID REFERENCES public.media_albums(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo','video')),
  mime_type TEXT,
  file_size BIGINT,
  captured_at TIMESTAMPTZ,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  organizer TEXT,
  photographer TEXT,
  subject TEXT,
  visible_world BOOLEAN NOT NULL DEFAULT false,
  visible_media BOOLEAN NOT NULL DEFAULT false,
  visible_friends BOOLEAN NOT NULL DEFAULT false,
  allowed_media_houses TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Media: owner read" ON public.media_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Media: world read" ON public.media_items FOR SELECT USING (visible_world = true);
CREATE POLICY "Media: owner insert" ON public.media_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Media: owner update" ON public.media_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Media: owner delete" ON public.media_items FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_media_items_updated
BEFORE UPDATE ON public.media_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_media_items_user ON public.media_items(user_id);
CREATE INDEX idx_media_items_album ON public.media_items(album_id);

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Media bucket: owner read"
ON storage.objects FOR SELECT
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Media bucket: owner insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Media bucket: owner update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Media bucket: owner delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);