
CREATE TABLE public.team_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  age_from INTEGER,
  age_to INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_groups_team ON public.team_groups(team_id, sort_order);

ALTER TABLE public.team_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TeamGroups: public read"
  ON public.team_groups FOR SELECT
  USING (true);

CREATE POLICY "TeamGroups: owner all"
  ON public.team_groups FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_groups.team_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_groups.team_id AND t.owner_id = auth.uid()));

CREATE TRIGGER team_groups_touch
  BEFORE UPDATE ON public.team_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.team_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.team_groups(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX idx_team_group_members_group ON public.team_group_members(group_id);
CREATE INDEX idx_team_group_members_team ON public.team_group_members(team_id);

ALTER TABLE public.team_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TeamGroupMembers: owner all"
  ON public.team_group_members FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_members.team_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_group_members.team_id AND t.owner_id = auth.uid()));

CREATE POLICY "TeamGroupMembers: self read"
  ON public.team_group_members FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
