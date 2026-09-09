-- Macro project phases: child rows under a gantt_project.
ALTER TABLE public.calendar_categories
  DROP CONSTRAINT IF EXISTS calendar_categories_kind_check;

ALTER TABLE public.calendar_categories
  ADD CONSTRAINT calendar_categories_kind_check
  CHECK (kind IN ('calendar', 'diary_activity', 'diary_strava', 'gantt_project', 'gantt_phase'));

ALTER TABLE public.calendar_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.calendar_categories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS calendar_categories_parent_id_idx
  ON public.calendar_categories (parent_id)
  WHERE parent_id IS NOT NULL;

ALTER TABLE public.calendar_categories
  DROP CONSTRAINT IF EXISTS calendar_categories_parent_kind_check;

ALTER TABLE public.calendar_categories
  ADD CONSTRAINT calendar_categories_parent_kind_check
  CHECK (
    (kind = 'gantt_phase' AND parent_id IS NOT NULL)
    OR (kind <> 'gantt_phase' AND parent_id IS NULL)
  );
