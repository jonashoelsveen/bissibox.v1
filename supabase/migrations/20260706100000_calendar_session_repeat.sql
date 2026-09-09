-- Persist repeat metadata on calendar sessions so repeat-series delete works
-- after reload / realtime sync.

ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS repeat_rule text,
  ADD COLUMN IF NOT EXISTS repeat_series_id text;

CREATE INDEX IF NOT EXISTS idx_calendar_sessions_repeat_series
  ON public.calendar_sessions (repeat_series_id)
  WHERE repeat_series_id IS NOT NULL;
