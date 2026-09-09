-- Individual profile display name (app-enforced 20 chars) and entity
-- profile description / website for the profile settings modal.
-- Existing owner/self RLS on profiles and app_teams covers updates.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.app_teams
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS website text;
