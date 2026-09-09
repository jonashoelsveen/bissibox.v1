-- Optional contact phone on entity roster admins and members.

ALTER TABLE public.app_team_admins
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.entity_members
  ADD COLUMN IF NOT EXISTS phone text;

NOTIFY pgrst, 'reload schema';
