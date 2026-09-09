-- Keep entity roster copies of account identity in sync with profiles.
-- Entity tables store first_name / last_name / date_of_birth on each
-- member and admin row so owners can read them under roster RLS.
-- Those copies must follow the linked user's account info.

CREATE OR REPLACE FUNCTION public.sync_profile_to_entity_roster()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name
     AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name
     AND NEW.birth_date IS NOT DISTINCT FROM OLD.birth_date
  THEN
    RETURN NEW;
  END IF;

  UPDATE public.entity_members
  SET
    first_name = NEW.first_name,
    last_name = NEW.last_name,
    date_of_birth = NEW.birth_date
  WHERE user_id = NEW.id
    AND (
      first_name IS DISTINCT FROM NEW.first_name
      OR last_name IS DISTINCT FROM NEW.last_name
      OR date_of_birth IS DISTINCT FROM NEW.birth_date
    );

  UPDATE public.app_team_admins
  SET
    first_name = NEW.first_name,
    last_name = NEW.last_name,
    date_of_birth = NEW.birth_date
  WHERE user_id = NEW.id
    AND (
      first_name IS DISTINCT FROM NEW.first_name
      OR last_name IS DISTINCT FROM NEW.last_name
      OR date_of_birth IS DISTINCT FROM NEW.birth_date
    );

  UPDATE public.entity_membership_requests
  SET
    first_name = NEW.first_name,
    last_name = NEW.last_name,
    date_of_birth = NEW.birth_date
  WHERE requester_id = NEW.id
    AND status = 'pending'
    AND (
      first_name IS DISTINCT FROM NEW.first_name
      OR last_name IS DISTINCT FROM NEW.last_name
      OR date_of_birth IS DISTINCT FROM NEW.birth_date
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_entity_roster ON public.profiles;
CREATE TRIGGER profiles_sync_entity_roster
  AFTER INSERT OR UPDATE OF first_name, last_name, birth_date
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_entity_roster();

UPDATE public.entity_members em
SET
  first_name = p.first_name,
  last_name = p.last_name,
  date_of_birth = p.birth_date
FROM public.profiles p
WHERE em.user_id = p.id
  AND (
    em.first_name IS DISTINCT FROM p.first_name
    OR em.last_name IS DISTINCT FROM p.last_name
    OR em.date_of_birth IS DISTINCT FROM p.birth_date
  );

UPDATE public.app_team_admins a
SET
  first_name = p.first_name,
  last_name = p.last_name,
  date_of_birth = p.birth_date
FROM public.profiles p
WHERE a.user_id = p.id
  AND (
    a.first_name IS DISTINCT FROM p.first_name
    OR a.last_name IS DISTINCT FROM p.last_name
    OR a.date_of_birth IS DISTINCT FROM p.birth_date
  );

UPDATE public.entity_membership_requests r
SET
  first_name = p.first_name,
  last_name = p.last_name,
  date_of_birth = p.birth_date
FROM public.profiles p
WHERE r.requester_id = p.id
  AND r.status = 'pending'
  AND (
    r.first_name IS DISTINCT FROM p.first_name
    OR r.last_name IS DISTINCT FROM p.last_name
    OR r.date_of_birth IS DISTINCT FROM p.birth_date
  );
