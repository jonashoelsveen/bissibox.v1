-- Shared calendars for the left panel, plus the session link that follows a calendar colour.

CREATE TABLE public.user_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.app_teams (id) ON DELETE CASCADE,
  app_group_id uuid REFERENCES public.app_team_groups (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.user_calendar_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES public.user_calendars (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  role text NOT NULL CHECK (role IN ('member', 'admin')),
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  invite_token text,
  invited_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_calendar_members_email_key
  ON public.user_calendar_members (calendar_id, lower(email));

CREATE UNIQUE INDEX user_calendar_members_token_key
  ON public.user_calendar_members (invite_token)
  WHERE invite_token IS NOT NULL;

CREATE TABLE public.user_calendar_visibility (
  calendar_id uuid NOT NULL REFERENCES public.user_calendars (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  hidden boolean NOT NULL DEFAULT false,
  PRIMARY KEY (calendar_id, user_id)
);

ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS user_calendar_id uuid REFERENCES public.user_calendars (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follows_calendar_color boolean NOT NULL DEFAULT false;

CREATE INDEX user_calendars_owner_idx ON public.user_calendars (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX user_calendar_members_user_idx ON public.user_calendar_members (user_id);
CREATE INDEX calendar_sessions_user_calendar_idx ON public.calendar_sessions (user_calendar_id);

-- Role of the current user on a calendar. Owner counts as admin.
-- Security definer so policies can call it without recursing through RLS.
CREATE OR REPLACE FUNCTION public.user_calendar_role(p_calendar uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.user_calendars c
      WHERE c.id = p_calendar
        AND c.owner_id = auth.uid()
        AND c.deleted_at IS NULL
    ) THEN 'admin'
    ELSE (
      SELECT m.role
      FROM public.user_calendar_members m
      JOIN public.user_calendars c ON c.id = m.calendar_id
      WHERE m.calendar_id = p_calendar
        AND m.user_id = auth.uid()
        AND m.status = 'accepted'
        AND c.deleted_at IS NULL
      LIMIT 1
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.user_calendar_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_calendar_role(uuid) TO authenticated;

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
    calendar_id, user_id, email, role, status, invited_by
  ) VALUES (
    NEW.id,
    NEW.owner_id,
    COALESCE(owner_email, ''),
    'admin',
    'accepted',
    NEW.owner_id
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.user_calendars_add_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_calendars_add_owner() TO authenticated;

CREATE TRIGGER user_calendars_add_owner
  AFTER INSERT ON public.user_calendars
  FOR EACH ROW
  EXECUTE FUNCTION public.user_calendars_add_owner();

CREATE OR REPLACE FUNCTION public.user_calendars_clear_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE public.calendar_sessions
    SET user_calendar_id = NULL,
        follows_calendar_color = false
    WHERE user_calendar_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.user_calendars_clear_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_calendars_clear_sessions() TO authenticated;

CREATE TRIGGER user_calendars_clear_sessions
  AFTER UPDATE OF deleted_at ON public.user_calendars
  FOR EACH ROW
  EXECUTE FUNCTION public.user_calendars_clear_sessions();

ALTER TABLE public.user_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_calendar_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_calendar_visibility ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_calendars TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_calendar_members TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_calendar_visibility TO authenticated, service_role;

-- owner_id is checked on the new row itself so INSERT ... RETURNING succeeds.
-- user_calendar_role re-reads the table and cannot see that row yet.
CREATE POLICY "uc: select visible"
  ON public.user_calendars FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      owner_id = auth.uid()
      OR public.user_calendar_role(id) IS NOT NULL
    )
  );

CREATE POLICY "uc: insert own"
  ON public.user_calendars FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "uc: update admin"
  ON public.user_calendars FOR UPDATE TO authenticated
  USING (public.user_calendar_role(id) = 'admin')
  WITH CHECK (public.user_calendar_role(id) = 'admin');

CREATE POLICY "ucm: select"
  ON public.user_calendar_members FOR SELECT TO authenticated
  USING (
    public.user_calendar_role(calendar_id) IS NOT NULL
    OR (
      status = 'pending'
      AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
  );

CREATE POLICY "ucm: insert admin"
  ON public.user_calendar_members FOR INSERT TO authenticated
  WITH CHECK (
    public.user_calendar_role(calendar_id) = 'admin'
    AND status = 'pending'
    AND role IN ('member', 'admin')
  );

CREATE POLICY "ucm: update admin"
  ON public.user_calendar_members FOR UPDATE TO authenticated
  USING (public.user_calendar_role(calendar_id) = 'admin')
  WITH CHECK (
    public.user_calendar_role(calendar_id) = 'admin'
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_calendars c
      WHERE c.id = calendar_id
        AND c.owner_id = user_calendar_members.user_id
        AND (role <> 'admin' OR status <> 'accepted')
    )
  );

CREATE POLICY "ucm: delete admin"
  ON public.user_calendar_members FOR DELETE TO authenticated
  USING (
    public.user_calendar_role(calendar_id) = 'admin'
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_calendars c
      WHERE c.id = user_calendar_members.calendar_id
        AND c.owner_id = user_calendar_members.user_id
    )
  );

CREATE POLICY "ucv: own"
  ON public.user_calendar_visibility FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND public.user_calendar_role(calendar_id) IS NOT NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_calendar_role(calendar_id) IS NOT NULL
  );

-- Members read sessions an admin added. Admins read every session on the calendar.
CREATE POLICY "cs: calendar member select"
  ON public.calendar_sessions FOR SELECT TO authenticated
  USING (
    user_calendar_id IS NOT NULL
    AND public.user_calendar_role(user_calendar_id) IS NOT NULL
    AND (
      public.user_calendar_role(user_calendar_id) = 'admin'
      OR EXISTS (
        SELECT 1
        FROM public.user_calendar_members a
        WHERE a.calendar_id = calendar_sessions.user_calendar_id
          AND a.status = 'accepted'
          AND a.role = 'admin'
          AND a.user_id = calendar_sessions.user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_calendars c
        WHERE c.id = calendar_sessions.user_calendar_id
          AND c.owner_id = calendar_sessions.user_id
          AND c.deleted_at IS NULL
      )
    )
  );

CREATE POLICY "cs: calendar admin insert"
  ON public.calendar_sessions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND user_calendar_id IS NOT NULL
    AND public.user_calendar_role(user_calendar_id) = 'admin'
    AND coach_pending = false
    AND created_by_coach_id IS NULL
  );

CREATE POLICY "cs: calendar admin update"
  ON public.calendar_sessions FOR UPDATE TO authenticated
  USING (
    user_calendar_id IS NOT NULL
    AND public.user_calendar_role(user_calendar_id) = 'admin'
  )
  WITH CHECK (
    user_calendar_id IS NULL
    OR public.user_calendar_role(user_calendar_id) = 'admin'
  );

-- Accept binds the token to the signed-in user's email.
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

  SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
  INTO v_name
  FROM public.profiles
  WHERE id = auth.uid();

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

REVOKE ALL ON FUNCTION public.accept_user_calendar_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_user_calendar_invite(text) TO authenticated;

-- Keep entity session upserts able to store the calendar link, and let a
-- calendar admin write a session on a calendar that belongs to that entity.
CREATE OR REPLACE FUNCTION public.upsert_entity_calendar_session_for(p_actor uuid, p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity uuid;
  session_id uuid;
  session_group uuid;
  session_calendar uuid;
  starts timestamptz;
  ends timestamptz;
  session_title text;
  calendar_admin boolean;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  entity := NULLIF(p->>'entity_id', '')::uuid;
  session_id := NULLIF(p->>'id', '')::uuid;
  starts := NULLIF(p->>'starts_at', '')::timestamptz;
  ends := NULLIF(p->>'ends_at', '')::timestamptz;
  session_title := NULLIF(btrim(COALESCE(p->>'title', '')), '');
  session_group := NULLIF(p->>'app_group_id', '')::uuid;
  session_calendar := NULLIF(p->>'user_calendar_id', '')::uuid;

  IF entity IS NULL OR session_id IS NULL OR starts IS NULL OR ends IS NULL OR session_title IS NULL THEN
    RAISE EXCEPTION 'invalid entity session payload';
  END IF;

  calendar_admin := session_calendar IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.user_calendars c
    WHERE c.id = session_calendar
      AND c.entity_id = entity
      AND c.deleted_at IS NULL
      AND (
        c.owner_id = p_actor
        OR EXISTS (
          SELECT 1
          FROM public.user_calendar_members m
          WHERE m.calendar_id = c.id
            AND m.user_id = p_actor
            AND m.status = 'accepted'
            AND m.role = 'admin'
        )
      )
  );

  IF NOT public.is_app_team_admin_for(p_actor, entity) AND NOT calendar_admin THEN
    RAISE EXCEPTION 'not an entity admin';
  END IF;

  IF session_group IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.app_team_groups g
    WHERE g.id = session_group
      AND g.team_id = entity
      AND g.deleted_at IS NULL
  ) THEN
    session_group := NULL;
  END IF;

  IF session_calendar IS NOT NULL AND NOT calendar_admin AND NOT EXISTS (
    SELECT 1 FROM public.user_calendars c
    WHERE c.id = session_calendar AND c.deleted_at IS NULL AND c.entity_id = entity
  ) THEN
    session_calendar := NULL;
  END IF;

  INSERT INTO public.calendar_sessions (
    id, user_id, entity_id, starts_at, ends_at, all_day, title, color, category, category_id,
    description, location, location_url, activity, distance_km, pace_sec_per_km, diary_type,
    diary_group, diary_sub, session_note, session_note_updated_at, sort_index, app_group_id,
    signup_enabled, repeat_rule, repeat_series_id, created_by_coach_id, coach_pending,
    user_calendar_id, follows_calendar_color
  )
  VALUES (
    session_id, p_actor, entity, starts, ends,
    COALESCE((p->>'all_day')::boolean, false),
    session_title,
    NULLIF(p->>'color', ''),
    NULLIF(p->>'category', ''),
    NULLIF(p->>'category_id', '')::uuid,
    NULLIF(p->>'description', ''),
    NULLIF(p->>'location', ''),
    NULLIF(p->>'location_url', ''),
    NULLIF(p->>'activity', ''),
    NULLIF(p->>'distance_km', '')::double precision,
    NULLIF(p->>'pace_sec_per_km', '')::double precision,
    NULLIF(p->>'diary_type', ''),
    NULLIF(p->>'diary_group', ''),
    NULLIF(p->>'diary_sub', ''),
    NULLIF(p->>'session_note', ''),
    NULLIF(p->>'session_note_updated_at', '')::timestamptz,
    NULLIF(p->>'sort_index', '')::bigint,
    session_group,
    COALESCE((p->>'signup_enabled')::boolean, false),
    NULLIF(p->>'repeat_rule', ''),
    NULLIF(p->>'repeat_series_id', '')::uuid,
    NULL, false,
    session_calendar,
    COALESCE((p->>'follows_calendar_color')::boolean, false)
  )
  ON CONFLICT (id) DO UPDATE
    SET
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      all_day = CASE WHEN p ? 'all_day' THEN EXCLUDED.all_day ELSE calendar_sessions.all_day END,
      title = EXCLUDED.title,
      color = CASE WHEN p ? 'color' THEN EXCLUDED.color ELSE calendar_sessions.color END,
      category = CASE WHEN p ? 'category' THEN EXCLUDED.category ELSE calendar_sessions.category END,
      category_id = CASE WHEN p ? 'category_id' THEN EXCLUDED.category_id ELSE calendar_sessions.category_id END,
      description = CASE WHEN p ? 'description' THEN EXCLUDED.description ELSE calendar_sessions.description END,
      location = CASE WHEN p ? 'location' THEN EXCLUDED.location ELSE calendar_sessions.location END,
      location_url = CASE WHEN p ? 'location_url' THEN EXCLUDED.location_url ELSE calendar_sessions.location_url END,
      activity = CASE WHEN p ? 'activity' THEN EXCLUDED.activity ELSE calendar_sessions.activity END,
      distance_km = CASE WHEN p ? 'distance_km' THEN EXCLUDED.distance_km ELSE calendar_sessions.distance_km END,
      pace_sec_per_km = CASE WHEN p ? 'pace_sec_per_km' THEN EXCLUDED.pace_sec_per_km ELSE calendar_sessions.pace_sec_per_km END,
      diary_type = CASE WHEN p ? 'diary_type' THEN EXCLUDED.diary_type ELSE calendar_sessions.diary_type END,
      diary_group = CASE WHEN p ? 'diary_group' THEN EXCLUDED.diary_group ELSE calendar_sessions.diary_group END,
      diary_sub = CASE WHEN p ? 'diary_sub' THEN EXCLUDED.diary_sub ELSE calendar_sessions.diary_sub END,
      session_note = CASE WHEN p ? 'session_note' THEN EXCLUDED.session_note ELSE calendar_sessions.session_note END,
      session_note_updated_at = CASE WHEN p ? 'session_note_updated_at' THEN EXCLUDED.session_note_updated_at ELSE calendar_sessions.session_note_updated_at END,
      sort_index = CASE WHEN p ? 'sort_index' THEN EXCLUDED.sort_index ELSE calendar_sessions.sort_index END,
      entity_id = entity,
      app_group_id = CASE WHEN p ? 'app_group_id' THEN EXCLUDED.app_group_id ELSE calendar_sessions.app_group_id END,
      signup_enabled = CASE WHEN p ? 'signup_enabled' THEN EXCLUDED.signup_enabled ELSE calendar_sessions.signup_enabled END,
      repeat_rule = CASE WHEN p ? 'repeat_rule' THEN EXCLUDED.repeat_rule ELSE calendar_sessions.repeat_rule END,
      repeat_series_id = CASE WHEN p ? 'repeat_series_id' THEN EXCLUDED.repeat_series_id ELSE calendar_sessions.repeat_series_id END,
      user_calendar_id = CASE WHEN p ? 'user_calendar_id' THEN EXCLUDED.user_calendar_id ELSE calendar_sessions.user_calendar_id END,
      follows_calendar_color = CASE WHEN p ? 'follows_calendar_color' THEN EXCLUDED.follows_calendar_color ELSE calendar_sessions.follows_calendar_color END
    WHERE (
        public.is_app_team_admin_for(p_actor, entity)
        OR calendar_admin
      )
      AND (
        calendar_sessions.entity_id IS NOT DISTINCT FROM entity
        OR calendar_sessions.entity_id IS NULL
      );

  IF NOT EXISTS (
    SELECT 1 FROM public.calendar_sessions cs
    WHERE cs.id = session_id AND cs.entity_id = entity
  ) THEN
    RAISE EXCEPTION 'entity session write failed';
  END IF;

  RETURN session_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
