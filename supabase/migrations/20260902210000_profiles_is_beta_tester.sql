-- Internal testers see entity surfaces while entityFlag is still compiled off.
-- SELECT uses existing profiles RLS (users read own). Authenticated users
-- cannot promote themselves; service_role / SQL admin can set the column.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_beta_tester boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_beta_tester IS
  'Internal tester: entity feature flags apply at runtime while compile-time entityFlag is off.';

CREATE OR REPLACE FUNCTION public.protect_profiles_is_beta_tester()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_beta_tester := false;
    RETURN NEW;
  END IF;

  NEW.is_beta_tester := OLD.is_beta_tester;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profiles_is_beta_tester ON public.profiles;
CREATE TRIGGER trg_protect_profiles_is_beta_tester
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_is_beta_tester();
