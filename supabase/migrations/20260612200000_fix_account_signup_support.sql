-- Ensure verification_attempts accepts the 'account_signup' target kind
-- and profiles has the email_verified flag required by the OTP sign-up flow.
-- Both statements are fully idempotent.

-- 1. Extend the target_kind check constraint to include account_signup
ALTER TABLE public.verification_attempts
  DROP CONSTRAINT IF EXISTS verification_attempts_target_kind_check;

ALTER TABLE public.verification_attempts
  ADD CONSTRAINT verification_attempts_target_kind_check
    CHECK (target_kind = ANY (ARRAY[
      'event_registration'::text,
      'team_membership'::text,
      'account_signup'::text
    ]));

-- 2. Add email_verified to profiles if it does not already exist.
-- Existing rows keep true (pre-date this requirement); new signups start at false
-- until the account_signup OTP is completed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'email_verified'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN email_verified boolean NOT NULL DEFAULT true;

    ALTER TABLE public.profiles
      ALTER COLUMN email_verified SET DEFAULT false;
  END IF;
END $$;
