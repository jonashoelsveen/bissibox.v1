-- Account profile ensure + patch via SECURITY DEFINER RPCs.
-- Lets signed-in users persist profile changes even when direct table RLS/grants
-- are misconfigured, while still enforcing auth.uid() = profile id.

CREATE OR REPLACE FUNCTION public.ensure_own_profile_row()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  meta jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid) THEN
    RETURN uid;
  END IF;

  SELECT email, raw_user_meta_data INTO uemail, meta
  FROM auth.users
  WHERE id = uid;

  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    uid,
    uemail,
    NULLIF(BTRIM(COALESCE(meta->>'first_name', '')), ''),
    NULLIF(BTRIM(COALESCE(meta->>'last_name', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN uid;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_own_profile_row() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_own_profile_row() TO authenticated;

CREATE OR REPLACE FUNCTION public.patch_own_account_profile(
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_mobile text DEFAULT NULL,
  p_patch_first_name boolean DEFAULT false,
  p_patch_last_name boolean DEFAULT false,
  p_patch_birth_date boolean DEFAULT false,
  p_patch_mobile boolean DEFAULT false
)
RETURNS TABLE (
  first_name text,
  last_name text,
  birth_date date,
  email text,
  mobile text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM public.ensure_own_profile_row();

  UPDATE public.profiles AS p
  SET
    first_name = CASE WHEN p_patch_first_name THEN p_first_name ELSE p.first_name END,
    last_name = CASE WHEN p_patch_last_name THEN p_last_name ELSE p.last_name END,
    birth_date = CASE WHEN p_patch_birth_date THEN p_birth_date ELSE p.birth_date END,
    mobile = CASE WHEN p_patch_mobile THEN p_mobile ELSE p.mobile END
  WHERE p.id = uid;

  RETURN QUERY
  SELECT
    p.first_name,
    p.last_name,
    p.birth_date,
    p.email,
    p.mobile,
    p.updated_at
  FROM public.profiles AS p
  WHERE p.id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.patch_own_account_profile(
  text, text, date, text, boolean, boolean, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patch_own_account_profile(
  text, text, date, text, boolean, boolean, boolean, boolean
) TO authenticated;

-- Belt-and-suspenders: ensure authenticated users retain table privileges.
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
