-- Create enum for event type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE public.event_type AS ENUM ('meeting', 'event', 'race');
  END IF;
END$$;

-- Add column with default 'race' so existing rows get a sensible value
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_type public.event_type NOT NULL DEFAULT 'race';

-- Index for filtering by type on the events listing
CREATE INDEX IF NOT EXISTS idx_events_event_type ON public.events(event_type);