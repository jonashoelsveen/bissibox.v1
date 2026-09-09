-- Add email_verified flag to profiles.
-- Existing rows default to true (they pre-date this requirement and are considered verified).
-- The column default is then changed to false so every new signup starts unverified
-- until the account_signup OTP is completed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ALTER COLUMN email_verified SET DEFAULT false;
