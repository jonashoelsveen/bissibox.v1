-- 1) Schema: link albums to teams (optional). user_id stays the album owner.
ALTER TABLE public.media_albums
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_media_albums_team_id ON public.media_albums(team_id);

-- Allow only one "Profile" album per team
CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_albums_team_profile
  ON public.media_albums(team_id) WHERE name = 'Profile' AND team_id IS NOT NULL;

-- 2) RLS: team owners can manage their team's albums
DROP POLICY IF EXISTS "Albums: team owner all" ON public.media_albums;
CREATE POLICY "Albums: team owner all"
ON public.media_albums
FOR ALL
TO authenticated
USING (
  team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = media_albums.team_id AND t.owner_id = auth.uid()
  )
)
WITH CHECK (
  team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = media_albums.team_id AND t.owner_id = auth.uid()
  )
);

-- 3) Linking media items to a team album: media_item_albums INSERT policy must
--    accept albums where the team owner = auth.uid()
DROP POLICY IF EXISTS "MediaItemAlbums: owner insert" ON public.media_item_albums;
CREATE POLICY "MediaItemAlbums: owner insert"
ON public.media_item_albums
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.media_items m
    WHERE m.id = media_item_albums.media_item_id AND m.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.media_albums a
    WHERE a.id = media_item_albums.album_id
      AND (
        a.user_id = auth.uid()
        OR (a.team_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = a.team_id AND t.owner_id = auth.uid()
        ))
      )
  )
);

-- 4) Auto-create a "Profile" album whenever a team is created
CREATE OR REPLACE FUNCTION public.create_default_team_profile_album()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.media_albums (user_id, team_id, name, description)
  VALUES (NEW.owner_id, NEW.id, 'Profile', 'Public team profile content visible to everyone.')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_team_profile_album ON public.teams;
CREATE TRIGGER trg_create_default_team_profile_album
AFTER INSERT ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.create_default_team_profile_album();