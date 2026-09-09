-- Persist Macro Gantt project spans as inclusive month indices (0–11).
ALTER TABLE public.calendar_categories
  ADD COLUMN IF NOT EXISTS gantt_start_month smallint,
  ADD COLUMN IF NOT EXISTS gantt_end_month smallint;

ALTER TABLE public.calendar_categories
  DROP CONSTRAINT IF EXISTS calendar_categories_gantt_span_check;

ALTER TABLE public.calendar_categories
  ADD CONSTRAINT calendar_categories_gantt_span_check
  CHECK (
    (gantt_start_month IS NULL AND gantt_end_month IS NULL)
    OR (
      gantt_start_month IS NOT NULL
      AND gantt_end_month IS NOT NULL
      AND gantt_start_month >= 0
      AND gantt_start_month <= 11
      AND gantt_end_month >= 0
      AND gantt_end_month <= 11
      AND gantt_end_month >= gantt_start_month
    )
  );
