-- Read-only iCalendar subscriptions. The feed URL is a secret and lives only
-- in this table as ciphertext. Parsed events are never stored.

ALTER TABLE public.user_calendars
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'local';

ALTER TABLE public.user_calendars
  DROP CONSTRAINT IF EXISTS user_calendars_source_check;

ALTER TABLE public.user_calendars
  ADD CONSTRAINT user_calendars_source_check
  CHECK (source IN ('local', 'subscription'));

CREATE TABLE public.user_calendar_subscriptions (
  calendar_id uuid PRIMARY KEY REFERENCES public.user_calendars (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  url_ciphertext bytea NOT NULL,
  url_iv bytea NOT NULL,
  key_version integer NOT NULL,
  url_hmac bytea NOT NULL,
  label_source text NOT NULL CHECK (label_source IN ('feed', 'user')),
  sync_status text NOT NULL DEFAULT 'ok' CHECK (sync_status IN ('pending', 'ok', 'error')),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  etag text,
  last_modified text,
  refresh_interval_seconds integer NOT NULL DEFAULT 3600,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, url_hmac)
);

CREATE INDEX user_calendar_subscriptions_owner_idx
  ON public.user_calendar_subscriptions (owner_id);

ALTER TABLE public.user_calendar_subscriptions ENABLE ROW LEVEL SECURITY;

-- No policies: anon and authenticated cannot read or write this table.
REVOKE ALL ON TABLE public.user_calendar_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_calendar_subscriptions TO service_role;

REVOKE SELECT (url_ciphertext, url_iv, url_hmac)
  ON public.user_calendar_subscriptions FROM anon, authenticated;

-- A rename from the existing calendar UI marks the label as the user's.
CREATE OR REPLACE FUNCTION public.user_calendar_subscriptions_label_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Feed refreshes update the name through the service role and must keep
  -- label_source = 'feed'. A rename from the app uses the user JWT.
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.user_calendar_subscriptions
    SET label_source = 'user',
        updated_at = now()
    WHERE calendar_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_calendars_subscription_label ON public.user_calendars;
CREATE TRIGGER user_calendars_subscription_label
  AFTER UPDATE OF name ON public.user_calendars
  FOR EACH ROW
  EXECUTE FUNCTION public.user_calendar_subscriptions_label_source();

REVOKE ALL ON FUNCTION public.user_calendar_subscriptions_label_source() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_calendar_subscriptions_label_source() TO authenticated, service_role;
