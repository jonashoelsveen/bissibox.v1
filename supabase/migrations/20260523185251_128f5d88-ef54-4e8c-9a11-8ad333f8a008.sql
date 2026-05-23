ALTER TABLE public.calendar_categories
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'calendar';

ALTER TABLE public.calendar_categories
  DROP CONSTRAINT IF EXISTS calendar_categories_kind_check;

ALTER TABLE public.calendar_categories
  ADD CONSTRAINT calendar_categories_kind_check
  CHECK (kind IN ('calendar', 'diary_activity', 'diary_strava'));

CREATE INDEX IF NOT EXISTS calendar_categories_kind_idx
  ON public.calendar_categories (kind);
