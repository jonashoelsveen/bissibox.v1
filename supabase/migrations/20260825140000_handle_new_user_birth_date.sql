-- Copy signup birth_date from auth user metadata onto the profiles row.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, birth_date)
  VALUES (
    new.id,
    new.email,
    NULLIF(BTRIM(COALESCE(new.raw_user_meta_data->>'first_name', '')), ''),
    NULLIF(BTRIM(COALESCE(new.raw_user_meta_data->>'last_name', '')), ''),
    CASE
      WHEN COALESCE(new.raw_user_meta_data->>'birth_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (new.raw_user_meta_data->>'birth_date')::date
      ELSE NULL
    END
  );
  RETURN new;
END;
$$;

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

  INSERT INTO public.profiles (id, email, first_name, last_name, birth_date)
  VALUES (
    uid,
    uemail,
    NULLIF(BTRIM(COALESCE(meta->>'first_name', '')), ''),
    NULLIF(BTRIM(COALESCE(meta->>'last_name', '')), ''),
    CASE
      WHEN COALESCE(meta->>'birth_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (meta->>'birth_date')::date
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN uid;
END;
$$;
