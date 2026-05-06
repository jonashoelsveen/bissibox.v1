-- Group leaders table: admins (board) invite people to be group leaders.
CREATE TABLE IF NOT EXISTS public.team_group_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  user_id UUID,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_at TIMESTAMPTZ,
  invited_by UUID,
  accepted_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_group_leaders_team_idx ON public.team_group_leaders(team_id);
CREATE INDEX IF NOT EXISTS team_group_leaders_email_idx ON public.team_group_leaders(lower(email));
CREATE INDEX IF NOT EXISTS team_group_leaders_user_idx ON public.team_group_leaders(user_id);

ALTER TABLE public.team_group_leaders ENABLE ROW LEVEL SECURITY;

-- Team owners (admins) can fully manage rows for their team.
CREATE POLICY "GroupLeaders: team owner all"
  ON public.team_group_leaders
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_leaders.team_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_leaders.team_id AND t.owner_id = auth.uid()));

-- Active board members can also manage (admins).
CREATE POLICY "GroupLeaders: board admin all"
  ON public.team_group_leaders
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_leaders.team_id AND b.user_id = auth.uid() AND b.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_board_members b WHERE b.team_id = team_group_leaders.team_id AND b.user_id = auth.uid() AND b.status = 'active'));

-- The leader themselves can read their own row(s) (by user_id or by email).
CREATE POLICY "GroupLeaders: self read"
  ON public.team_group_leaders
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

-- The leader can update their own row to accept (set status/user_id/accepted_at).
CREATE POLICY "GroupLeaders: self accept"
  ON public.team_group_leaders
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

CREATE TRIGGER team_group_leaders_touch_updated_at
  BEFORE UPDATE ON public.team_group_leaders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
