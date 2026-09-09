-- Calendar URL subscriptions (iCal / webcal). Removing a row CASCADE-deletes
-- the sessions that feed produced.

CREATE TABLE IF NOT EXISTS public.calendar_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cal_id text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_user_id uuid NULL,
  scope_entity_id uuid NULL,
  input_url text NOT NULL,
  feed_url text NOT NULL,
  etag text NULL,
  http_last_modified text NULL,
  sync_token text NULL,
  last_synced_at timestamptz NULL,
  next_sync_at timestamptz NOT NULL DEFAULT now(),
  last_http_status integer NULL,
  last_error text NULL,
  event_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, cal_id, feed_url)
);

CREATE INDEX IF NOT EXISTS calendar_subscriptions_cal_created_idx
  ON public.calendar_subscriptions (cal_id, created_by);

CREATE INDEX IF NOT EXISTS calendar_subscriptions_next_sync_idx
  ON public.calendar_subscriptions (next_sync_at);

DROP TRIGGER IF EXISTS calendar_subscriptions_set_updated_at ON public.calendar_subscriptions;
CREATE TRIGGER calendar_subscriptions_set_updated_at
  BEFORE UPDATE ON public.calendar_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS subscription_id uuid NULL
    REFERENCES public.calendar_subscriptions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ical_uid text NULL,
  ADD COLUMN IF NOT EXISTS ical_recurrence_id text NULL;

CREATE INDEX IF NOT EXISTS calendar_sessions_subscription_id_idx
  ON public.calendar_sessions (subscription_id)
  WHERE subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_sessions_subscription_uid_uidx
  ON public.calendar_sessions (
    subscription_id,
    ical_uid,
    (COALESCE(ical_recurrence_id, ''))
  )
  WHERE subscription_id IS NOT NULL AND ical_uid IS NOT NULL;

ALTER TABLE public.calendar_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Calendar subscriptions: creator read" ON public.calendar_subscriptions;
CREATE POLICY "Calendar subscriptions: creator read"
  ON public.calendar_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Calendar subscriptions: creator insert" ON public.calendar_subscriptions;
CREATE POLICY "Calendar subscriptions: creator insert"
  ON public.calendar_subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Calendar subscriptions: creator update" ON public.calendar_subscriptions;
CREATE POLICY "Calendar subscriptions: creator update"
  ON public.calendar_subscriptions FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Calendar subscriptions: creator delete" ON public.calendar_subscriptions;
CREATE POLICY "Calendar subscriptions: creator delete"
  ON public.calendar_subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- Worker claims due rows under the service role (bypasses RLS).
CREATE OR REPLACE FUNCTION public.claim_due_calendar_subscriptions(p_limit integer DEFAULT 10)
RETURNS SETOF public.calendar_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.calendar_subscriptions sub
  SET next_sync_at = now() + interval '60 seconds'
  WHERE sub.id IN (
    SELECT s.id
    FROM public.calendar_subscriptions s
    WHERE s.next_sync_at <= now()
    ORDER BY s.next_sync_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 25))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING sub.*;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_subscriptions TO authenticated;
GRANT ALL ON public.calendar_subscriptions TO service_role;

REVOKE ALL ON FUNCTION public.claim_due_calendar_subscriptions(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_calendar_subscriptions(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_calendar_subscriptions(integer) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'calendar-sync-drain';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'calendar-sync-drain',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ifskkkjimvyyzpqliwjo.supabase.co/functions/v1/calendar-sync-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmc2tra2ppbXZ5eXpwcWxpd2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNTAxNjUsImV4cCI6MjA5NjgyNjE2NX0.pNobjOK4JVC-ZXl3cgvPzEINQruolMmA2jSoCFd01bA'
    ),
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);
