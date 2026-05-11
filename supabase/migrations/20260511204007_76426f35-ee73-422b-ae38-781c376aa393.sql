
DROP TABLE IF EXISTS public.team_active_followers CASCADE;

CREATE TABLE public.user_active_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  follower_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_active_followers_unique UNIQUE (member_id, follower_id)
);
CREATE INDEX idx_user_active_followers_follower ON public.user_active_followers (follower_id);
CREATE INDEX idx_user_active_followers_member ON public.user_active_followers (member_id);
ALTER TABLE public.user_active_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_active_followers: self or member read"
  ON public.user_active_followers FOR SELECT TO authenticated
  USING (follower_id = auth.uid() OR member_id = auth.uid());

CREATE POLICY "user_active_followers: member manages"
  ON public.user_active_followers FOR ALL TO authenticated
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_active_follower_of_member(_member uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_active_followers
    WHERE member_id = _member AND follower_id = auth.uid()
  );
$$;
