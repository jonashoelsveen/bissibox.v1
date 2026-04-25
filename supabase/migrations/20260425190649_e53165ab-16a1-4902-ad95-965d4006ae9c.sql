
ALTER TABLE public.media_items
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS scanned_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_details jsonb NOT NULL DEFAULT '{}'::jsonb;
