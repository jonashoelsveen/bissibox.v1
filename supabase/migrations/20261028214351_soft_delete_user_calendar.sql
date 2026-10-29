-- Postgres applies the SELECT policy to the new row of an UPDATE. The select
-- policy hides rows once deleted_at is set, so a direct soft-delete is
-- rejected and the calendar stays in the list. This function checks admin
-- while the row is still visible, then marks it deleted as the table owner.

CREATE OR REPLACE FUNCTION public.soft_delete_user_calendar(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.user_calendar_role(p_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_calendars
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = p_id
    AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_user_calendar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_user_calendar(uuid) TO authenticated;
