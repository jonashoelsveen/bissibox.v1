-- Connected Google / Outlook / iCloud calendar accounts.
-- Token columns are not granted to authenticated; the public view exposes
-- only non-secret fields. Service role (sync worker + OAuth callbacks) reads tokens.

ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS ical_last_modified timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ical_sequence integer NULL;

CREATE TABLE IF NOT EXISTS public.calendar_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'outlook', 'icloud')),
  email text NULL,
  provider_account_id text NOT NULL,
  calendar_id text NULL,
  calendar_name text NOT NULL DEFAULT 'Aponna Calendar',
  access_token_enc text NULL,
  refresh_token_enc text NULL,
  caldav_password_enc text NULL,
  token_expires_at timestamptz NULL,
  scope text NULL,
  last_synced_at timestamptz NULL,
  last_error text NULL,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'needs_reauth', 'error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS calendar_accounts_user_id_idx
  ON public.calendar_accounts (user_id);

DROP TRIGGER IF EXISTS calendar_accounts_set_updated_at ON public.calendar_accounts;
CREATE TRIGGER calendar_accounts_set_updated_at
  BEFORE UPDATE ON public.calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

CREATE TABLE IF NOT EXISTS public.calendar_account_event_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.calendar_accounts(id) ON DELETE CASCADE,
  session_id uuid NULL REFERENCES public.calendar_sessions(id) ON DELETE SET NULL,
  ical_uid text NOT NULL,
  ical_recurrence_id text NULL,
  provider_event_id text NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_account_event_map_uidx
  ON public.calendar_account_event_map (
    account_id,
    ical_uid,
    (COALESCE(ical_recurrence_id, ''))
  );

CREATE INDEX IF NOT EXISTS calendar_account_event_map_session_idx
  ON public.calendar_account_event_map (session_id)
  WHERE session_id IS NOT NULL;

DROP TRIGGER IF EXISTS calendar_account_event_map_set_updated_at ON public.calendar_account_event_map;
CREATE TRIGGER calendar_account_event_map_set_updated_at
  BEFORE UPDATE ON public.calendar_account_event_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

ALTER TABLE public.calendar_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_account_event_map ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.calendar_account_event_map FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.calendar_accounts TO service_role;
GRANT ALL ON public.calendar_account_event_map TO service_role;

GRANT SELECT (
  id, user_id, provider, email, provider_account_id, calendar_id, calendar_name,
  last_synced_at, last_error, status, created_at, updated_at
) ON public.calendar_accounts TO authenticated;

DROP POLICY IF EXISTS "calendar_accounts: owner read public cols" ON public.calendar_accounts;
CREATE POLICY "calendar_accounts: owner read public cols"
  ON public.calendar_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP VIEW IF EXISTS public.calendar_accounts_public;
CREATE VIEW public.calendar_accounts_public
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  provider,
  email,
  provider_account_id,
  calendar_id,
  calendar_name,
  last_synced_at,
  last_error,
  status,
  created_at,
  updated_at
FROM public.calendar_accounts;

GRANT SELECT ON public.calendar_accounts_public TO authenticated, service_role;
REVOKE ALL ON public.calendar_accounts_public FROM anon;
