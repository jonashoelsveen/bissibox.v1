-- People submenu shows the account page profile name for everyone on the
-- calendar, including the owner. Keep user_calendar_members.display_name in
-- step with profiles so other members can read it under RLS.

CREATE OR REPLACE FUNCTION public.user_calendar_profile_name(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(btrim(p.display_name), ''),
    NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
  )
  FROM public.profiles p
  WHERE p.id = p_user;
$$;

REVOKE ALL ON FUNCTION public.user_calendar_profile_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_calendar_profile_name(uuid) TO authenticated, service_role;

-- Owner row carries the owner's profile name from the start.
CREATE OR REPLACE FUNCTION public.user_calendars_add_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_email text;
BEGIN
  SELECT email INTO owner_email FROM auth.users WHERE id = NEW.owner_id;
  INSERT INTO public.user_calendar_members (
    calendar_id, user_id, email, display_name, role, status, invited_by
  ) VALUES (
    NEW.id,
    NEW.owner_id,
    COALESCE(owner_email, ''),
    public.user_calendar_profile_name(NEW.owner_id),
    'admin',
    'accepted',
    NEW.owner_id
  );
  RETURN NEW;
END;
$$;

-- Accepting an invite stores the profile name of the person who accepted.
CREATE OR REPLACE FUNCTION public.accept_user_calendar_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_row public.user_calendar_members%ROWTYPE;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in required');
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in required');
  END IF;

  SELECT * INTO v_row
  FROM public.user_calendar_members
  WHERE invite_token = p_token
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invite not found');
  END IF;

  IF lower(v_row.email) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invite was sent to a different email');
  END IF;

  v_name := public.user_calendar_profile_name(auth.uid());

  UPDATE public.user_calendar_members
  SET status = 'accepted',
      user_id = auth.uid(),
      display_name = COALESCE(v_name, display_name),
      invite_token = NULL,
      updated_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'calendar_id', v_row.calendar_id);
END;
$$;

-- A profile name edit on the account page flows to every calendar row.
CREATE OR REPLACE FUNCTION public.sync_profile_name_to_user_calendar_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := COALESCE(
    NULLIF(btrim(NEW.display_name), ''),
    NULLIF(btrim(concat_ws(' ', NEW.first_name, NEW.last_name)), '')
  );
  UPDATE public.user_calendar_members
  SET display_name = v_name,
      updated_at = now()
  WHERE user_id = NEW.id
    AND display_name IS DISTINCT FROM v_name;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_name_to_user_calendar_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_profile_name_to_user_calendar_members() TO authenticated, service_role;

DROP TRIGGER IF EXISTS profiles_sync_user_calendar_members ON public.profiles;
CREATE TRIGGER profiles_sync_user_calendar_members
  AFTER INSERT OR UPDATE OF display_name, first_name, last_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_name_to_user_calendar_members();

-- Backfill rows that already have an account behind them.
UPDATE public.user_calendar_members m
SET display_name = public.user_calendar_profile_name(m.user_id)
WHERE m.user_id IS NOT NULL
  AND public.user_calendar_profile_name(m.user_id) IS NOT NULL
  AND m.display_name IS DISTINCT FROM public.user_calendar_profile_name(m.user_id);
