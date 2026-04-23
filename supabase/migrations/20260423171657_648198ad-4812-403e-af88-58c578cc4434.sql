ALTER TABLE public.media_items
ADD COLUMN IF NOT EXISTS uploaded_in_mode text NOT NULL DEFAULT 'participant';

CREATE INDEX IF NOT EXISTS idx_media_items_uploaded_in_mode
  ON public.media_items (user_id, uploaded_in_mode);