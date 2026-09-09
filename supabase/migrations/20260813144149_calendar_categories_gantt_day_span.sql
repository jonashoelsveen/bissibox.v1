-- Day-precision Macro Gantt spans (edge resize). Weeks remain for mark-create.
ALTER TABLE public.calendar_categories
  ADD COLUMN IF NOT EXISTS gantt_start_date date,
  ADD COLUMN IF NOT EXISTS gantt_end_date date;

ALTER TABLE public.calendar_categories
  DROP CONSTRAINT IF EXISTS calendar_categories_gantt_dates_check;

ALTER TABLE public.calendar_categories
  ADD CONSTRAINT calendar_categories_gantt_dates_check
  CHECK (
    (gantt_start_date IS NULL AND gantt_end_date IS NULL)
    OR (
      gantt_start_date IS NOT NULL
      AND gantt_end_date IS NOT NULL
      AND gantt_end_date >= gantt_start_date
    )
  );
