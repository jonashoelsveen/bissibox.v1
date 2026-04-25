
-- Verification attempts table
CREATE TABLE public.verification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  destination text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('event_registration','team_membership')),
  target_id uuid NOT NULL,
  target_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_verif_user_recent ON public.verification_attempts (user_id, created_at DESC);
CREATE INDEX idx_verif_lookup ON public.verification_attempts (user_id, target_kind, target_id, consumed_at, expires_at);

ALTER TABLE public.verification_attempts ENABLE ROW LEVEL SECURITY;

-- No user-facing policies. Only service role (edge functions) can access.
-- (RLS enabled with no policies = deny-all to anon/authenticated.)

CREATE TRIGGER trg_verification_attempts_updated
BEFORE UPDATE ON public.verification_attempts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
