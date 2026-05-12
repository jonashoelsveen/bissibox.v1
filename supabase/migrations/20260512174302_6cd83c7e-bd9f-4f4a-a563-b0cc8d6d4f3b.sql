-- Add `kind` to diary notes so a single user (who is both leader and member of their own group)
-- can have a separate "member" note and "leader" note on the same day/session.

ALTER TABLE public.diary_day_notes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'member';

ALTER TABLE public.diary_session_notes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'member';

-- Backfill: rows authored by someone other than the member are leader-notes
UPDATE public.diary_day_notes SET kind = 'leader' WHERE author_id <> member_id;
UPDATE public.diary_session_notes SET kind = 'leader' WHERE author_id <> member_id;

-- Constrain allowed values
ALTER TABLE public.diary_day_notes
  DROP CONSTRAINT IF EXISTS diary_day_notes_kind_check;
ALTER TABLE public.diary_day_notes
  ADD CONSTRAINT diary_day_notes_kind_check CHECK (kind IN ('member','leader'));

ALTER TABLE public.diary_session_notes
  DROP CONSTRAINT IF EXISTS diary_session_notes_kind_check;
ALTER TABLE public.diary_session_notes
  ADD CONSTRAINT diary_session_notes_kind_check CHECK (kind IN ('member','leader'));

-- Replace unique constraints to include `kind`
ALTER TABLE public.diary_day_notes DROP CONSTRAINT IF EXISTS diary_day_notes_unique;
ALTER TABLE public.diary_day_notes
  ADD CONSTRAINT diary_day_notes_unique UNIQUE (member_id, author_id, day, kind);

ALTER TABLE public.diary_session_notes DROP CONSTRAINT IF EXISTS diary_session_notes_unique;
ALTER TABLE public.diary_session_notes
  ADD CONSTRAINT diary_session_notes_unique UNIQUE (event_id, author_id, kind);

-- Tighten RLS so 'member' kind can only be written when author = member,
-- and 'leader' kind requires annotate access (still permits author = member if leader of self).
DROP POLICY IF EXISTS "diary_day_notes: insert own" ON public.diary_day_notes;
CREATE POLICY "diary_day_notes: insert own"
  ON public.diary_day_notes FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND can_annotate_member(member_id)
    AND (
      (kind = 'member' AND author_id = member_id)
      OR (kind = 'leader')
    )
  );

DROP POLICY IF EXISTS "diary_day_notes: update own" ON public.diary_day_notes;
CREATE POLICY "diary_day_notes: update own"
  ON public.diary_day_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (
    author_id = auth.uid()
    AND can_annotate_member(member_id)
    AND (
      (kind = 'member' AND author_id = member_id)
      OR (kind = 'leader')
    )
  );

DROP POLICY IF EXISTS "diary_session_notes: insert own" ON public.diary_session_notes;
CREATE POLICY "diary_session_notes: insert own"
  ON public.diary_session_notes FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND can_annotate_member(member_id)
    AND (
      (kind = 'member' AND author_id = member_id)
      OR (kind = 'leader')
    )
  );

DROP POLICY IF EXISTS "diary_session_notes: update own" ON public.diary_session_notes;
CREATE POLICY "diary_session_notes: update own"
  ON public.diary_session_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (
    author_id = auth.uid()
    AND can_annotate_member(member_id)
    AND (
      (kind = 'member' AND author_id = member_id)
      OR (kind = 'leader')
    )
  );

-- New helper: leader-context viewer role (skips the owner short-circuit)
CREATE OR REPLACE FUNCTION public.get_member_viewer_role_for_leader(_member uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.is_group_leader_of_member(_member) THEN 'leader'
    WHEN public.is_active_follower_of_member(_member) THEN 'active_follower'
    WHEN public.is_follower_of_member(_member) THEN 'follower'
    ELSE 'none'
  END;
$$;