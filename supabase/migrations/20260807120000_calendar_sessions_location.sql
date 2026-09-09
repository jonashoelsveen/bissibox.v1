-- Add location text for calendar session menus (import Room → location).
ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS location text NULL;
