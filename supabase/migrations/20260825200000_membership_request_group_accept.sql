-- Accepting a membership request with a group must not fail the whole
-- transaction if group linking errors. Reload PostgREST so the RPC signature
-- is visible in the schema cache.

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
    BEGIN
      INSERT INTO public.entity_member_groups (team_id, member_id, group_id)
      VALUES (req.team_id, member_id, p_group_id)
      ON CONFLICT (member_id, group_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'decide_entity_membership_request group link: %', SQLERRM;
    END;
  END IF;

  DELETE FROM public.entity_membership_requests WHERE id = req.id;
  RETURN jsonb_build_object('ok', true, 'status', 'accepted', 'member_id', member_id);
END;
$$;

REVOKE ALL ON FUNCTION public.decide_entity_membership_request(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_entity_membership_request(uuid, uuid, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_entity_membership_request(uuid, uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
