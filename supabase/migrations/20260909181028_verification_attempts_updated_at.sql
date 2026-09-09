-- The attempts-increment UPDATE was failing: a BEFORE UPDATE trigger calls
-- touch_updated_at() but verification_attempts had no updated_at column.
-- Failed writes left attempts at 0, so every wrong code showed "2 attempts left".
ALTER TABLE public.verification_attempts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
