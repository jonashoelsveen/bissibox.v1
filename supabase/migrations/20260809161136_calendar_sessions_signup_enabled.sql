-- Persist entity session "Enable sign up" toggle on calendar_sessions.
ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS signup_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.calendar_sessions.signup_enabled IS
  'When true, participant signup is enabled for this session (entity calendars).';
