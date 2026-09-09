-- Inbound join-by-Entity-ID requests. Distinct from outbound invite `pending`
-- on entity_members / app_team_admins.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Keep one live membership per user per entity.
DELETE FROM public.entity_members em
WHERE em.user_id IS NOT NULL
  AND em.id NOT IN (
    SELECT DISTINCT ON (team_id, user_id) id
    FROM public.entity_members
    WHERE user_id IS NOT NULL
    ORDER BY team_id, user_id, created_at ASC NULLS LAST, id ASC
  );

CREATE UNIQUE INDEX IF NOT EXISTS entity_members_team_user_unique
  ON public.entity_members (team_id, user_id)
  WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "entity_members: self select" ON public.entity_members;
CREATE POLICY "entity_members: self select" ON public.entity_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "app_team_admins: self select" ON public.app_team_admins;
CREATE POLICY "app_team_admins: self select" ON public.app_team_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "app_teams: member select own" ON public.app_teams;
CREATE POLICY "app_teams: member select own" ON public.app_teams
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entity_members m
      WHERE m.team_id = app_teams.id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE TABLE IF NOT EXISTS public.entity_membership_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.app_teams(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_name text NOT NULL,
  email text,
  first_name text,
  last_name text,
  date_of_birth date,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'denied')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  deny_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, requester_id)
);

CREATE INDEX IF NOT EXISTS entity_membership_requests_team_status_idx
  ON public.entity_membership_requests (team_id, status);

CREATE INDEX IF NOT EXISTS entity_membership_requests_requester_status_idx
  ON public.entity_membership_requests (requester_id, status);

CREATE TABLE IF NOT EXISTS public.entity_membership_request_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_membership_request_attempts_requester_created_idx
  ON public.entity_membership_request_attempts (requester_id, created_at DESC);

ALTER TABLE public.entity_membership_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_membership_request_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_membership_requests: requester select" ON public.entity_membership_requests;
CREATE POLICY "entity_membership_requests: requester select" ON public.entity_membership_requests
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid());

DROP POLICY IF EXISTS "entity_membership_requests: admin select" ON public.entity_membership_requests;
CREATE POLICY "entity_membership_requests: admin select" ON public.entity_membership_requests
  FOR SELECT TO authenticated
  USING (public.is_app_team_admin(team_id));

GRANT SELECT ON public.entity_membership_requests TO authenticated;
GRANT ALL ON public.entity_membership_requests TO service_role;
GRANT ALL ON public.entity_membership_request_attempts TO service_role;

ALTER TABLE public.entity_membership_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'entity_membership_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entity_membership_requests;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.decide_entity_membership_request(
  p_request_id uuid,
  p_actor_id uuid,
  p_action text,
  p_group_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.entity_membership_requests%ROWTYPE;
  member_id uuid;
  existing_id uuid;
  group_ok boolean;
BEGIN
  IF p_action NOT IN ('accept', 'deny') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  SELECT * INTO req
  FROM public.entity_membership_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF p_action = 'deny' THEN
    UPDATE public.entity_membership_requests
    SET
      status = 'denied',
      decided_by = p_actor_id,
      decided_at = now(),
      deny_expires_at = now() + interval '24 hours'
    WHERE id = req.id;
    RETURN jsonb_build_object('ok', true, 'status', 'denied');
  END IF;

  IF p_group_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.app_team_groups g
      WHERE g.id = p_group_id
        AND g.team_id = req.team_id
        AND g.deleted_at IS NULL
    ) INTO group_ok;
    IF NOT group_ok THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_group');
    END IF;
  END IF;

  SELECT em.id INTO existing_id
  FROM public.entity_members em
  WHERE em.team_id = req.team_id
    AND (
      em.user_id = req.requester_id
      OR (
        req.email IS NOT NULL
        AND em.email IS NOT NULL
        AND lower(em.email) = lower(req.email)
      )
    )
  ORDER BY CASE WHEN em.user_id = req.requester_id THEN 0 ELSE 1 END, em.created_at ASC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.entity_members
    SET
      user_id = req.requester_id,
      status = 'active',
      first_name = COALESCE(req.first_name, first_name),
      last_name = COALESCE(req.last_name, last_name),
      date_of_birth = COALESCE(req.date_of_birth, date_of_birth),
      email = COALESCE(req.email, email),
      app_group_id = COALESCE(p_group_id, app_group_id),
      invite_token = NULL
    WHERE id = existing_id;
    member_id := existing_id;
  ELSE
    INSERT INTO public.entity_members (
      team_id,
      user_id,
      email,
      first_name,
      last_name,
      date_of_birth,
      status,
      app_group_id
    ) VALUES (
      req.team_id,
      req.requester_id,
      req.email,
      req.first_name,
      req.last_name,
      req.date_of_birth,
      'active',
      p_group_id
    )
    RETURNING id INTO member_id;
  END IF;

  IF p_group_id IS NOT NULL THEN
    INSERT INTO public.entity_member_groups (team_id, member_id, group_id)
    VALUES (req.team_id, member_id, p_group_id)
    ON CONFLICT (member_id, group_id) DO NOTHING;
  END IF;

  DELETE FROM public.entity_membership_requests WHERE id = req.id;
  RETURN jsonb_build_object('ok', true, 'status', 'accepted', 'member_id', member_id);
END;
$$;

REVOKE ALL ON FUNCTION public.decide_entity_membership_request(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_entity_membership_request(uuid, uuid, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_entity_membership_request(uuid, uuid, text, uuid) TO service_role;

DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'entity-membership-requests-expire';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'entity-membership-requests-expire',
  '*/15 * * * *',
  $$
  DELETE FROM public.entity_membership_requests
  WHERE status = 'denied' AND deny_expires_at IS NOT NULL AND deny_expires_at < now();
  DELETE FROM public.entity_membership_request_attempts
  WHERE created_at < now() - interval '2 days';
  $$
);

NOTIFY pgrst, 'reload schema';
