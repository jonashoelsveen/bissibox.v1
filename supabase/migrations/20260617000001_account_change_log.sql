-- Audit trail for account.aponna.com profile and security changes.
-- Inserts are server-only (service role); users may read their own history.

CREATE TABLE IF NOT EXISTS public.account_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('profile_update', 'password_change')),
  field_names text[] NOT NULL DEFAULT '{}',
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_change_log_user_id_created_at_idx
  ON public.account_change_log (user_id, created_at DESC);

ALTER TABLE public.account_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account change log: users read own" ON public.account_change_log;
CREATE POLICY "Account change log: users read own"
  ON public.account_change_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Tighten profiles self-update: row must remain owned by the caller.
DROP POLICY IF EXISTS "Profiles: users update own" ON public.profiles;
CREATE POLICY "Profiles: users update own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
