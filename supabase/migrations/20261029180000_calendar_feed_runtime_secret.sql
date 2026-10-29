-- Runtime feed keys for hosts that do not have CALENDAR_FEED_* env vars.
-- Values live in vault. This function returns only the three named secrets,
-- and only the service role may call it.

CREATE OR REPLACE FUNCTION public.calendar_feed_runtime_secret(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
    AND p_name IN (
      'calendar_feed_enc_key',
      'calendar_feed_hmac_key',
      'calendar_feed_key_version'
    )
  ORDER BY created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.calendar_feed_runtime_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_feed_runtime_secret(text) TO service_role;
