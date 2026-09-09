-- Allow verification_attempts to store account-deletion OTPs.

ALTER TABLE public.verification_attempts
  DROP CONSTRAINT IF EXISTS verification_attempts_target_kind_check;

ALTER TABLE public.verification_attempts
  ADD CONSTRAINT verification_attempts_target_kind_check
  CHECK (target_kind = ANY (ARRAY[
    'event_registration'::text,
    'team_membership'::text,
    'account_signup'::text,
    'account_email_change'::text,
    'account_deletion'::text
  ]));
