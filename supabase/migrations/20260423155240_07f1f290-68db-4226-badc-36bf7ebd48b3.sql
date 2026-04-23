-- Junction table for many-to-many media items <-> albums
CREATE TABLE public.media_item_albums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  media_item_id UUID NOT NULL REFERENCES public.media_items(id) ON DELETE CASCADE,
  album_id UUID NOT NULL REFERENCES public.media_albums(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (media_item_id, album_id)
);

CREATE INDEX idx_media_item_albums_media ON public.media_item_albums(media_item_id);
CREATE INDEX idx_media_item_albums_album ON public.media_item_albums(album_id);

ALTER TABLE public.media_item_albums ENABLE ROW LEVEL SECURITY;

-- Owner of the media item controls album links
CREATE POLICY "MediaItemAlbums: owner read"
ON public.media_item_albums
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.media_items m WHERE m.id = media_item_id AND m.user_id = auth.uid()));

CREATE POLICY "MediaItemAlbums: public read of world media"
ON public.media_item_albums
FOR SELECT
TO public
USING (EXISTS (SELECT 1 FROM public.media_items m WHERE m.id = media_item_id AND m.visible_world = true));

CREATE POLICY "MediaItemAlbums: owner insert"
ON public.media_item_albums
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.media_items m WHERE m.id = media_item_id AND m.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.media_albums a WHERE a.id = album_id AND a.user_id = auth.uid())
);

CREATE POLICY "MediaItemAlbums: owner delete"
ON public.media_item_albums
FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.media_items m WHERE m.id = media_item_id AND m.user_id = auth.uid()));

-- Backfill from existing single album_id
INSERT INTO public.media_item_albums (media_item_id, album_id)
SELECT id, album_id FROM public.media_items WHERE album_id IS NOT NULL
ON CONFLICT DO NOTHING;