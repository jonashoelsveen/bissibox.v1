-- Switch Macro Gantt spans from month indices to week indices within the year view.
ALTER TABLE public.calendar_categories
  DROP CONSTRAINT IF EXISTS calendar_categories_gantt_span_check;

ALTER TABLE public.calendar_categories
  RENAME COLUMN gantt_start_month TO gantt_start_week;

ALTER TABLE public.calendar_categories
  RENAME COLUMN gantt_end_month TO gantt_end_week;

ALTER TABLE public.calendar_categories
  ADD CONSTRAINT calendar_categories_gantt_span_check
  CHECK (
    (gantt_start_week IS NULL AND gantt_end_week IS NULL)
    OR (
      gantt_start_week IS NOT NULL
      AND gantt_end_week IS NOT NULL
      AND gantt_start_week >= 0
      AND gantt_start_week <= 53
      AND gantt_end_week >= 0
      AND gantt_end_week <= 53
      AND gantt_end_week >= gantt_start_week
    )
  );
