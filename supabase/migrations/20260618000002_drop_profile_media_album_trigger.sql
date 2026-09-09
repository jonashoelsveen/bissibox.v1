-- media_albums was removed (20260612210000) but the profiles insert trigger that
-- created a default "Profile" album was left behind. Account profile ensure/save
-- inserts a profiles row for some users and then fails on this orphaned trigger.

DROP TRIGGER IF EXISTS on_profile_created_make_album ON public.profiles;
DROP FUNCTION IF EXISTS public.create_default_profile_album();
