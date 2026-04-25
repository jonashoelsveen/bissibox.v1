ALTER TABLE public.team_membership_tiers
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

UPDATE public.team_membership_tiers
SET is_active = COALESCE(is_active, true),
    is_public = COALESCE(is_public, true)
WHERE is_active IS DISTINCT FROM COALESCE(is_active, true)
   OR is_public IS DISTINCT FROM COALESCE(is_public, true);

CREATE OR REPLACE FUNCTION public.normalize_team_membership_tier_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS NULL THEN
    NEW.is_active := true;
  END IF;

  IF NEW.is_public IS NULL THEN
    NEW.is_public := true;
  END IF;

  IF NEW.is_active = false THEN
    NEW.is_public := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_team_membership_tier_visibility ON public.team_membership_tiers;
CREATE TRIGGER trg_normalize_team_membership_tier_visibility
BEFORE INSERT OR UPDATE ON public.team_membership_tiers
FOR EACH ROW
EXECUTE FUNCTION public.normalize_team_membership_tier_visibility();

CREATE OR REPLACE FUNCTION public.enforce_team_has_public_active_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_membership_tiers t
    WHERE t.team_id = NEW.team_id
      AND t.is_active = true
      AND t.is_public = true
      AND (NEW.tier_id IS NULL OR t.id = NEW.tier_id)
  ) THEN
    RAISE EXCEPTION 'This team has no public memberships available.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_team_has_tiers ON public.team_memberships;
DROP TRIGGER IF EXISTS trg_enforce_team_has_public_active_tier ON public.team_memberships;
CREATE TRIGGER trg_enforce_team_has_public_active_tier
BEFORE INSERT ON public.team_memberships
FOR EACH ROW
EXECUTE FUNCTION public.enforce_team_has_public_active_tier();