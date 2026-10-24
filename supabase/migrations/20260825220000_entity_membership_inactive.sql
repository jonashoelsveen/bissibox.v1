-- Soft-cancel linked memberships so account.bissibox.com can list
-- inactive rows ("Cancelled …") without losing the person record.

ALTER TABLE public.entity_members
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.entity_members DROP CONSTRAINT IF EXISTS entity_members_status_check;
ALTER TABLE public.entity_members
  ADD CONSTRAINT entity_members_status_check
  CHECK (status IN ('pending', 'active', 'roster', 'inactive'));

DROP INDEX IF EXISTS public.entity_members_team_email_unique;
CREATE UNIQUE INDEX entity_members_team_email_unique
  ON public.entity_members (team_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '' AND status <> 'inactive';

CREATE OR REPLACE FUNCTION public.entity_members_cancelled_at_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'inactive' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    NEW.cancelled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entity_members_cancelled_at_sync ON public.entity_members;
CREATE TRIGGER entity_members_cancelled_at_sync
  BEFORE UPDATE OF status ON public.entity_members
  FOR EACH ROW
  EXECUTE FUNCTION public.entity_members_cancelled_at_sync();

NOTIFY pgrst, 'reload schema';
