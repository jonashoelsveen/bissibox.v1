-- Allow gantt Macro projects to reuse calendar_categories (kind = gantt_project).
ALTER TABLE public.calendar_categories
  DROP CONSTRAINT IF EXISTS calendar_categories_kind_check;

ALTER TABLE public.calendar_categories
  ADD CONSTRAINT calendar_categories_kind_check
  CHECK (kind IN ('calendar', 'diary_activity', 'diary_strava', 'gantt_project'));
