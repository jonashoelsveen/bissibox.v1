CREATE TABLE IF NOT EXISTS public.app_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.app_teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  invite_token text,
  invited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, email)
);

ALTER TABLE public.app_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_team_members: team owner all" ON public.app_team_members;
CREATE POLICY "app_team_members: team owner all" ON public.app_team_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_team_members TO authenticated, service_role;

INSERT INTO public.app_team_members (team_id, email, user_id, status, invite_token, invited_at, created_at)
SELECT team_id, email, user_id, status, invite_token, invited_at, created_at
FROM public.app_team_athletes
ON CONFLICT (team_id, email) DO NOTHING;

INSERT INTO public.app_team_members (team_id, email, user_id, status, invite_token, invited_at, created_at)
SELECT team_id, email, user_id, status, invite_token, invited_at, created_at
FROM public.app_team_coaches
ON CONFLICT (team_id, email) DO NOTHING;

NOTIFY pgrst, 'reload schema';
