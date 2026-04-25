
-- 1. Clean up orphan memberships in entities with no tiers
DELETE FROM public.team_memberships
WHERE team_id NOT IN (SELECT team_id FROM public.team_membership_tiers);

-- 2. Trigger: prevent creating memberships in entities without tiers
CREATE OR REPLACE FUNCTION public.enforce_team_has_tiers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.team_membership_tiers WHERE team_id = NEW.team_id
  ) THEN
    RAISE EXCEPTION 'This team has no memberships configured.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_team_has_tiers ON public.team_memberships;
CREATE TRIGGER trg_enforce_team_has_tiers
BEFORE INSERT ON public.team_memberships
FOR EACH ROW EXECUTE FUNCTION public.enforce_team_has_tiers();

-- 3. Trigger: auto-create an "Undefined" group and assign membership if no group set
CREATE OR REPLACE FUNCTION public.ensure_undefined_group_for_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  -- Only act when membership has no group assigned
  IF NEW.group_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find an existing group for the team; pick "Undefined" if present, else any
  SELECT id INTO v_group_id
  FROM public.team_groups
  WHERE team_id = NEW.team_id AND lower(name) = 'undefined'
  LIMIT 1;

  IF v_group_id IS NULL THEN
    -- Check if team has ANY groups; if not, create the Undefined group
    IF NOT EXISTS (SELECT 1 FROM public.team_groups WHERE team_id = NEW.team_id) THEN
      INSERT INTO public.team_groups (team_id, name, is_default, sort_order)
      VALUES (NEW.team_id, 'Undefined', false, 0)
      RETURNING id INTO v_group_id;
    END IF;
  END IF;

  IF v_group_id IS NOT NULL THEN
    NEW.group_id := v_group_id;
    -- Also reflect in team_group_members for the Members/Chart pages
    INSERT INTO public.team_group_members (team_id, group_id, user_id)
    VALUES (NEW.team_id, v_group_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_undefined_group ON public.team_memberships;
CREATE TRIGGER trg_ensure_undefined_group
BEFORE INSERT ON public.team_memberships
FOR EACH ROW EXECUTE FUNCTION public.ensure_undefined_group_for_membership();

-- 4. Backfill: for any existing membership without a group, create "Undefined" group
--    (in teams where no groups exist) and assign.
DO $$
DECLARE
  r RECORD;
  v_group_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT tm.team_id
    FROM public.team_memberships tm
    WHERE tm.group_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.team_groups g WHERE g.team_id = tm.team_id)
  LOOP
    INSERT INTO public.team_groups (team_id, name, is_default, sort_order)
    VALUES (r.team_id, 'Undefined', false, 0)
    RETURNING id INTO v_group_id;
  END LOOP;

  -- Now assign all groupless memberships to the team's Undefined group (if any)
  UPDATE public.team_memberships tm
  SET group_id = g.id
  FROM public.team_groups g
  WHERE tm.team_id = g.team_id
    AND tm.group_id IS NULL
    AND lower(g.name) = 'undefined';

  -- Mirror to team_group_members
  INSERT INTO public.team_group_members (team_id, group_id, user_id)
  SELECT tm.team_id, tm.group_id, tm.user_id
  FROM public.team_memberships tm
  WHERE tm.group_id IS NOT NULL
  ON CONFLICT DO NOTHING;
END $$;
