
-- =========================================================
-- calendar_sessions: persistent storage for calendar events
-- =========================================================

CREATE TABLE IF NOT EXISTS public.calendar_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ownership
  user_id   uuid NOT NULL,
  entity_id uuid NULL,

  -- timing
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  all_day   boolean NOT NULL DEFAULT false,

  -- presentation
  title       text NOT NULL DEFAULT '',
  color       text NULL,
  category    text NULL,
  category_id uuid NULL REFERENCES public.calendar_categories(id) ON DELETE SET NULL,
  description text NULL,

  -- diary
  activity         text NULL,
  distance_km      numeric NULL,
  pace_sec_per_km  numeric NULL,
  diary_type       text NULL,
  diary_group      text NULL,
  diary_sub        text NULL,
  session_note            text NULL,
  session_note_updated_at timestamptz NULL,
  activities       jsonb NULL,

  -- strava
  strava_activity_id      bigint NULL,
  summary_polyline        text NULL,
  total_elevation_gain_m  numeric NULL,
  average_heartrate       numeric NULL,
  sport_type              text NULL,
  sub_type                text NULL,

  -- ordering
  sort_index bigint NULL,

  -- coach workflow
  created_by_coach_id uuid NULL,
  coach_pending       boolean NOT NULL DEFAULT false,

  -- timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_sessions_user_starts_idx
  ON public.calendar_sessions (user_id, starts_at);

CREATE INDEX IF NOT EXISTS calendar_sessions_entity_starts_idx
  ON public.calendar_sessions (entity_id, starts_at)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS calendar_sessions_coach_pending_idx
  ON public.calendar_sessions (user_id, coach_pending)
  WHERE coach_pending = true;

CREATE INDEX IF NOT EXISTS calendar_sessions_created_by_coach_idx
  ON public.calendar_sessions (created_by_coach_id)
  WHERE created_by_coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS calendar_sessions_strava_uidx
  ON public.calendar_sessions (user_id, strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;

-- updated_at trigger (reuses existing helper)
DROP TRIGGER IF EXISTS calendar_sessions_set_updated_at ON public.calendar_sessions;
CREATE TRIGGER calendar_sessions_set_updated_at
  BEFORE UPDATE ON public.calendar_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- =========================================================
-- Helper: does auth.uid() have an accepted coach relationship
-- on _owner with the requested calendar access level, AND access
-- to the given category (or category is null = always-allowed shell)?
-- =========================================================
CREATE OR REPLACE FUNCTION public.coach_can_edit_owner_category(
  _owner uuid,
  _category_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_coaches uc
    WHERE uc.owner_id = _owner
      AND uc.coach_user_id = auth.uid()
      AND uc.status = 'accepted'
      AND uc.calendar_access = 'edit'
  )
  AND (
    _category_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.calendar_category_coach_access a
      WHERE a.owner_id = _owner
        AND a.coach_user_id = auth.uid()
        AND a.category_id = _category_id
    )
  );
$$;

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.calendar_sessions ENABLE ROW LEVEL SECURITY;

-- Owner: full CRUD on own personal calendar rows
CREATE POLICY "cs: owner select"
  ON public.calendar_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "cs: owner insert"
  ON public.calendar_sessions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND created_by_coach_id IS NULL
    AND coach_pending = false
  );

CREATE POLICY "cs: owner update"
  ON public.calendar_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cs: owner delete"
  ON public.calendar_sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Entity (team) owner: full CRUD on team calendar rows
CREATE POLICY "cs: entity owner all"
  ON public.calendar_sessions FOR ALL TO authenticated
  USING (
    entity_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = calendar_sessions.entity_id AND t.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    entity_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = calendar_sessions.entity_id AND t.owner_id = auth.uid()
    )
  );

-- Viewers (followers, group leaders, accepted coaches): read-only
CREATE POLICY "cs: viewer select"
  ON public.calendar_sessions FOR SELECT TO authenticated
  USING (public.can_view_member(user_id));

-- Coach with edit access: insert a pending session in the owner's calendar,
-- scoped to a category the owner has granted them.
CREATE POLICY "cs: coach insert pending"
  ON public.calendar_sessions FOR INSERT TO authenticated
  WITH CHECK (
    entity_id IS NULL
    AND created_by_coach_id = auth.uid()
    AND coach_pending = true
    AND public.coach_can_edit_owner_category(user_id, category_id)
  );

-- Coach: edit/delete only their own still-pending session
CREATE POLICY "cs: coach update own pending"
  ON public.calendar_sessions FOR UPDATE TO authenticated
  USING (
    created_by_coach_id = auth.uid()
    AND coach_pending = true
    AND public.coach_can_edit_owner_category(user_id, category_id)
  )
  WITH CHECK (
    created_by_coach_id = auth.uid()
    AND coach_pending = true
    AND public.coach_can_edit_owner_category(user_id, category_id)
  );

CREATE POLICY "cs: coach delete own pending"
  ON public.calendar_sessions FOR DELETE TO authenticated
  USING (
    created_by_coach_id = auth.uid()
    AND coach_pending = true
  );

-- =========================================================
-- Realtime
-- =========================================================
ALTER TABLE public.calendar_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_sessions;
