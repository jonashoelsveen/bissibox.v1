-- Allow public read of media items that live in ANY "Profile" album
-- (individual or team), so the profile media tab matches the album exactly.
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
      AND a.name = 'Profile'
  );
$$;