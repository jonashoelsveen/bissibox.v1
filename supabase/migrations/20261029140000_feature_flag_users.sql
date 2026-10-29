-- Per-user feature grants. A row grants nothing until accepted_at is set.
-- feature_flag_launched is the database copy of the compile-time bit.
-- Flip it in the same commit that sets FEATURES.calendarTabsFlag to true.

CREATE TABLE public.feature_flag_users (
  flag_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid,
  invited_at timestamptz,
  accepted_at timestamptz,
  PRIMARY KEY (flag_key, user_id)
);

ALTER TABLE public.feature_flag_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ffu: select own"
  ON public.feature_flag_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.feature_flag_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.feature_flag_users TO authenticated;
GRANT ALL ON public.feature_flag_users TO service_role;

CREATE OR REPLACE FUNCTION public.feature_flag_launched(p_flag text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_flag IS NOT NULL AND false;
$$;

COMMENT ON FUNCTION public.feature_flag_launched(text) IS
  'Database copy of a compile-time feature flag. Returns false until the matching FEATURES bit is turned on in the same commit.';

REVOKE ALL ON FUNCTION public.feature_flag_launched(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feature_flag_launched(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "uc: insert own" ON public.user_calendars;
CREATE POLICY "uc: insert own"
  ON public.user_calendars
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      public.feature_flag_launched('calendarTabsFlag')
      OR EXISTS (
        SELECT 1
        FROM public.feature_flag_users AS grant_row
        WHERE grant_row.flag_key = 'calendarTabsFlag'
          AND grant_row.user_id = auth.uid()
          AND grant_row.accepted_at IS NOT NULL
      )
    )
  );

CREATE OR REPLACE FUNCTION public.accept_feature_flags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.feature_flag_users
  SET accepted_at = now()
  WHERE user_id = auth.uid()
    AND accepted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_feature_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_feature_flags() TO authenticated;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.feature_flag_users_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key text;
BEGIN
  IF NEW.flag_key IS DISTINCT FROM 'calendarTabsFlag' OR NEW.invited_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret
    INTO service_key
    FROM vault.decrypted_secrets
    WHERE name = 'feature_flag_invite_service_role_key'
    LIMIT 1;

    IF service_key IS NULL OR service_key = '' THEN
      SELECT decrypted_secret
      INTO service_key
      FROM vault.decrypted_secrets
      WHERE name = 'email_queue_service_role_key'
      LIMIT 1;
    END IF;

    IF service_key IS NULL OR service_key = '' THEN
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url := 'https://ifskkkjimvyyzpqliwjo.supabase.co/functions/v1/feature-flag-invite',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'flag_key', NEW.flag_key,
        'user_id', NEW.user_id
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.feature_flag_users_invite() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feature_flag_users_invite() TO service_role;

DROP TRIGGER IF EXISTS feature_flag_users_invite ON public.feature_flag_users;
CREATE TRIGGER feature_flag_users_invite
  AFTER INSERT ON public.feature_flag_users
  FOR EACH ROW
  EXECUTE FUNCTION public.feature_flag_users_invite();
