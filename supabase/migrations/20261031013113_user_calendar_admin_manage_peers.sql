-- An admin can change or remove another admin, including the calendar creator.
-- The creator's row is what grants nothing extra once owner_id moves, so a
-- demotion or delete of the creator first hands ownership to the acting admin.
-- You still cannot change your own row.

CREATE OR REPLACE FUNCTION public.user_calendar_member_managed(
  p_member_id uuid
)
RETURNS public.user_calendar_members
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.user_calendar_members%ROWTYPE;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.user_calendar_members
  WHERE id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF public.user_calendar_role(v_row.calendar_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF v_row.user_id IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NOT NULL AND lower(v_row.email) = v_email THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_calendar_member_role(
  p_member_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.user_calendar_members%ROWTYPE;
BEGIN
  IF p_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  v_row := public.user_calendar_member_managed(p_member_id);

  IF v_row.user_id IS NOT NULL AND p_role <> 'admin' AND EXISTS (
    SELECT 1
    FROM public.user_calendars c
    WHERE c.id = v_row.calendar_id
      AND c.owner_id = v_row.user_id
      AND c.deleted_at IS NULL
  ) THEN
    UPDATE public.user_calendars
    SET owner_id = auth.uid(),
        updated_at = now()
    WHERE id = v_row.calendar_id
      AND deleted_at IS NULL;
  END IF;

  UPDATE public.user_calendar_members
  SET role = p_role,
      updated_at = now()
  WHERE id = v_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_user_calendar_member(
  p_member_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.user_calendar_members%ROWTYPE;
BEGIN
  v_row := public.user_calendar_member_managed(p_member_id);

  IF v_row.user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.user_calendars c
    WHERE c.id = v_row.calendar_id
      AND c.owner_id = v_row.user_id
      AND c.deleted_at IS NULL
  ) THEN
    UPDATE public.user_calendars
    SET owner_id = auth.uid(),
        updated_at = now()
    WHERE id = v_row.calendar_id
      AND deleted_at IS NULL;
  END IF;

  DELETE FROM public.user_calendar_members
  WHERE id = v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.user_calendar_member_managed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_calendar_member_managed(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.set_user_calendar_member_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_calendar_member_role(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_user_calendar_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_user_calendar_member(uuid) TO authenticated;
