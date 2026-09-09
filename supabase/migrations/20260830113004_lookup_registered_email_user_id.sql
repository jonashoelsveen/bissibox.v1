-- Case-insensitive check: is this email already used by another account?
-- Used by account email-change. Service role only (avoids email enumeration).

CREATE OR REPLACE FUNCTION public.email_registered_to_other_user(
  p_email text,
  p_except_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := lower(btrim(p_email));
BEGIN
  IF normalized IS NULL OR normalized = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.email IS NOT NULL
      AND lower(u.email) = normalized
      AND u.id IS DISTINCT FROM p_except_user_id
  ) OR EXISTS (
    SELECT 1
    FROM auth.identities AS i
    WHERE i.user_id IS DISTINCT FROM p_except_user_id
      AND (
        lower(coalesce(i.identity_data->>'email', '')) = normalized
        OR (i.provider = 'email' AND lower(i.provider_id) = normalized)
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.email IS NOT NULL
      AND lower(p.email) = normalized
      AND p.id IS DISTINCT FROM p_except_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.email_registered_to_other_user(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_registered_to_other_user(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.email_registered_to_other_user(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_registered_to_other_user(text, uuid) TO service_role;
