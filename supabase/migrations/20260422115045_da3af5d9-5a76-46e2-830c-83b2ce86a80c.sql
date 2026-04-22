ALTER TABLE public.event_subevents
  ADD COLUMN IF NOT EXISTS course_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS split_points jsonb NOT NULL DEFAULT '[]'::jsonb;