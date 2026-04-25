ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS media_contact_email text;