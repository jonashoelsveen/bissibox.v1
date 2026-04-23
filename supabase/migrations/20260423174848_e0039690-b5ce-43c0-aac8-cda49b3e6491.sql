-- 1) Backfill: ensure every existing team has exactly one "Profile" album
INSERT INTO public.media_albums (user_id, team_id, name, description)
SELECT t.owner_id, t.id, 'Profile', 'Public team profile content visible to everyone exploring this team.'
FROM public.teams t
WHERE NOT EXISTS (
  SELECT 1 FROM public.media_albums a
  WHERE a.team_id = t.id AND a.name = 'Profile'
);

-- 2) Unique partial indexes: enforce exactly one "Profile" album per workspace
-- Individual: one Profile album per user where team_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS uniq_profile_album_per_user
  ON public.media_albums (user_id)
  WHERE team_id IS NULL AND name = 'Profile';

-- Team: one Profile album per team
CREATE UNIQUE INDEX IF NOT EXISTS uniq_profile_album_per_team
  ON public.media_albums (team_id)
  WHERE team_id IS NOT NULL AND name = 'Profile';

-- 3) Trigger: auto-create the Profile album when a team is created
CREATE OR REPLACE FUNCTION public.create_default_team_profile_album()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.media_albums (user_id, team_id, name, description)
  VALUES (NEW.owner_id, NEW.id, 'Profile', 'Public team profile content visible to everyone exploring this team.')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_profile_album ON public.teams;
CREATE TRIGGER trg_team_profile_album
AFTER INSERT ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.create_default_team_profile_album();