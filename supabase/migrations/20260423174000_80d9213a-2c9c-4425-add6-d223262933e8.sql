-- Drop the recursive policy
DROP POLICY IF EXISTS "Media: team profile public read" ON public.media_items;

-- Helper: is this media item linked to any team's "Profile" album?
-- SECURITY DEFINER bypasses RLS on media_item_albums/media_albums, breaking the recursion.
CREATE OR REPLACE FUNCTION public.is_media_in_team_profile_album(_media_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.media_item_albums mia
    JOIN public.media_albums a ON a.id = mia.album_id
    WHERE mia.media_item_id = _media_id
      AND a.team_id IS NOT NULL
      AND a.name = 'Profile'
  );
$$;

-- Recreate the policy using the helper
CREATE POLICY "Media: team profile public read"
ON public.media_items
FOR SELECT
TO public
USING (public.is_media_in_team_profile_album(id));