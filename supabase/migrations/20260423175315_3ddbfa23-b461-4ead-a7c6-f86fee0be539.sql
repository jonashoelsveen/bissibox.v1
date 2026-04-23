ALTER TABLE public.media_albums
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_media_albums_sort
  ON public.media_albums (user_id, team_id, pinned DESC, sort_order ASC, created_at DESC);