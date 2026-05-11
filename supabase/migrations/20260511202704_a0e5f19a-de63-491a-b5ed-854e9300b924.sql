-- =========================================================
-- Followers
-- =========================================================
CREATE TABLE public.team_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  follower_id uuid NOT NULL,
  team_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_followers_unique UNIQUE (member_id, follower_id, team_id)
);
CREATE INDEX idx_team_followers_follower ON public.team_followers (follower_id);
CREATE INDEX idx_team_followers_member ON public.team_followers (member_id);
ALTER TABLE public.team_followers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.team_active_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  follower_id uuid NOT NULL,
  team_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_active_followers_unique UNIQUE (member_id, follower_id, team_id)
);
CREATE INDEX idx_team_active_followers_follower ON public.team_active_followers (follower_id);
CREATE INDEX idx_team_active_followers_member ON public.team_active_followers (member_id);
ALTER TABLE public.team_active_followers ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Helper functions (security definer to avoid RLS recursion)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_group_leader_of_member(_member uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_group_members m
    JOIN public.team_group_leaders l ON l.group_id = m.group_id
    WHERE m.user_id = _member
      AND (
        l.user_id = auth.uid()
        OR lower(l.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_follower_of_member(_member uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_active_followers
    WHERE member_id = _member AND follower_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_follower_of_member(_member uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_followers
    WHERE member_id = _member AND follower_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_annotate_member(_member uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _member = auth.uid()
      OR public.is_group_leader_of_member(_member)
      OR public.is_active_follower_of_member(_member);
$$;

CREATE OR REPLACE FUNCTION public.can_view_member(_member uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_annotate_member(_member)
      OR public.is_follower_of_member(_member);
$$;

CREATE OR REPLACE FUNCTION public.get_member_viewer_role(_member uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _member = auth.uid() THEN 'owner'
    WHEN public.is_group_leader_of_member(_member) THEN 'leader'
    WHEN public.is_active_follower_of_member(_member) THEN 'active_follower'
    WHEN public.is_follower_of_member(_member) THEN 'follower'
    ELSE 'none'
  END;
$$;

-- =========================================================
-- RLS for follower tables
-- =========================================================
CREATE POLICY "team_followers: self or member read"
  ON public.team_followers FOR SELECT TO authenticated
  USING (follower_id = auth.uid() OR member_id = auth.uid());

CREATE POLICY "team_followers: member manages"
  ON public.team_followers FOR ALL TO authenticated
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

CREATE POLICY "team_active_followers: self or member read"
  ON public.team_active_followers FOR SELECT TO authenticated
  USING (follower_id = auth.uid() OR member_id = auth.uid());

CREATE POLICY "team_active_followers: member manages"
  ON public.team_active_followers FOR ALL TO authenticated
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

-- =========================================================
-- Diary day notes
-- =========================================================
CREATE TABLE public.diary_day_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  author_id uuid NOT NULL,
  day date NOT NULL,
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diary_day_notes_unique UNIQUE (member_id, author_id, day)
);
CREATE INDEX idx_diary_day_notes_member_day ON public.diary_day_notes (member_id, day);
ALTER TABLE public.diary_day_notes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_diary_day_notes_updated_at
  BEFORE UPDATE ON public.diary_day_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

CREATE POLICY "diary_day_notes: read"
  ON public.diary_day_notes FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR member_id = auth.uid()
    OR public.can_view_member(member_id)
  );

CREATE POLICY "diary_day_notes: insert own"
  ON public.diary_day_notes FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.can_annotate_member(member_id)
  );

CREATE POLICY "diary_day_notes: update own"
  ON public.diary_day_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid() AND public.can_annotate_member(member_id));

CREATE POLICY "diary_day_notes: delete own"
  ON public.diary_day_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- =========================================================
-- Diary session notes
-- =========================================================
CREATE TABLE public.diary_session_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  member_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diary_session_notes_unique UNIQUE (event_id, author_id)
);
CREATE INDEX idx_diary_session_notes_member ON public.diary_session_notes (member_id);
CREATE INDEX idx_diary_session_notes_event ON public.diary_session_notes (event_id);
ALTER TABLE public.diary_session_notes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_diary_session_notes_updated_at
  BEFORE UPDATE ON public.diary_session_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

CREATE POLICY "diary_session_notes: read"
  ON public.diary_session_notes FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR member_id = auth.uid()
    OR public.can_view_member(member_id)
  );

CREATE POLICY "diary_session_notes: insert own"
  ON public.diary_session_notes FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.can_annotate_member(member_id)
  );

CREATE POLICY "diary_session_notes: update own"
  ON public.diary_session_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid() AND public.can_annotate_member(member_id));

CREATE POLICY "diary_session_notes: delete own"
  ON public.diary_session_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid());