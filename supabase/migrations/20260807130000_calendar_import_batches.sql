-- Import batch log: groups sessions created by a single file import so users
-- can delete a batch or rewind to a prior import state.

CREATE TABLE IF NOT EXISTS public.calendar_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cal_id text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Denormalized scope for RLS / listing (mirrors calendar_sessions ownership).
  scope_user_id uuid NULL,
  scope_entity_id uuid NULL,
  source_name text NULL,
  session_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_import_batches_cal_created_idx
  ON public.calendar_import_batches (cal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS calendar_import_batches_created_by_idx
  ON public.calendar_import_batches (created_by, created_at DESC);

ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS import_batch_id uuid NULL
    REFERENCES public.calendar_import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calendar_sessions_import_batch_id_idx
  ON public.calendar_sessions (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

ALTER TABLE public.calendar_import_batches ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read batches they created (API also scopes by cal_id).
DROP POLICY IF EXISTS "Import batches: creator read" ON public.calendar_import_batches;
CREATE POLICY "Import batches: creator read"
  ON public.calendar_import_batches
  FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Import batches: creator insert" ON public.calendar_import_batches;
CREATE POLICY "Import batches: creator insert"
  ON public.calendar_import_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Import batches: creator update" ON public.calendar_import_batches;
CREATE POLICY "Import batches: creator update"
  ON public.calendar_import_batches
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Import batches: creator delete" ON public.calendar_import_batches;
CREATE POLICY "Import batches: creator delete"
  ON public.calendar_import_batches
  FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);
