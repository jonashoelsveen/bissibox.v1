ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS timing_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_timing_company ON public.events (timing_company_id);