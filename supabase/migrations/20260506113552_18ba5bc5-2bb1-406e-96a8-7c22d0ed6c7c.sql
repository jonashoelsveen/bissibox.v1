
-- strava_auth
CREATE TABLE public.strava_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  athlete_id bigint NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strava_auth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strava_auth: self select" ON public.strava_auth FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "strava_auth: self insert" ON public.strava_auth FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "strava_auth: self update" ON public.strava_auth FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "strava_auth: self delete" ON public.strava_auth FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER strava_auth_touch BEFORE UPDATE ON public.strava_auth
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- activities
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'strava',
  strava_activity_id bigint,
  name text,
  sport_type text,
  sub_type text,
  start_date timestamptz,
  elapsed_time_sec integer,
  moving_time_sec integer,
  distance_m numeric,
  total_elevation_gain_m numeric,
  average_heartrate numeric,
  max_heartrate numeric,
  average_speed numeric,
  summary_polyline text,
  map_polyline text,
  raw jsonb,
  sync_status text NOT NULL DEFAULT 'pending',
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, strava_activity_id)
);

CREATE INDEX activities_user_start_idx ON public.activities (user_id, start_date DESC);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities: self select" ON public.activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "activities: self insert" ON public.activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "activities: self update" ON public.activities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "activities: self delete" ON public.activities FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER activities_touch BEFORE UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
