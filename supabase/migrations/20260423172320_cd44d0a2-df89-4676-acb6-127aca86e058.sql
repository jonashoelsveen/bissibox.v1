CREATE OR REPLACE FUNCTION public.media_make_public_when_in_profile_album()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_profile boolean;
BEGIN
  SELECT (a.name = 'Profile') INTO is_profile
  FROM public.media_albums a
  WHERE a.id = NEW.album_id;

  IF is_profile THEN
    UPDATE public.media_items
       SET visible_world = true
     WHERE id = NEW.media_item_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_make_public_when_in_profile_album ON public.media_item_albums;
CREATE TRIGGER trg_media_make_public_when_in_profile_album
AFTER INSERT ON public.media_item_albums
FOR EACH ROW EXECUTE FUNCTION public.media_make_public_when_in_profile_album();

-- Backfill: any item already linked to a "Profile" album becomes visible
UPDATE public.media_items mi
SET visible_world = true
WHERE EXISTS (
  SELECT 1
  FROM public.media_item_albums mia
  JOIN public.media_albums a ON a.id = mia.album_id
  WHERE mia.media_item_id = mi.id
    AND a.name = 'Profile'
);