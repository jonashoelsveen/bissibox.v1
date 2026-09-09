-- MazeMap deep-link for imported Bielsys locations (short location text stays in `location`).
ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS location_url text NULL;
