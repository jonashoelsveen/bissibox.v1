
-- Function: create default Profile album for a user
CREATE OR REPLACE FUNCTION public.create_default_profile_album()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.media_albums (user_id, name, description)
  VALUES (NEW.id, 'Profile', 'Public profile content visible to everyone exploring your profile.')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger on profiles insert (profiles row is created by handle_new_user on signup)
DROP TRIGGER IF EXISTS on_profile_created_make_album ON public.profiles;
CREATE TRIGGER on_profile_created_make_album
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.create_default_profile_album();

-- Backfill: create a Profile album for existing profiles that don't have one
INSERT INTO public.media_albums (user_id, name, description)
SELECT p.id, 'Profile', 'Public profile content visible to everyone exploring your profile.'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.media_albums a
  WHERE a.user_id = p.id AND a.name = 'Profile'
);
