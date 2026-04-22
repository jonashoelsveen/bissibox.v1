ALTER TABLE public.events ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_events_published ON public.events(published);