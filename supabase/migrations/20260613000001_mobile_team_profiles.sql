-- Mobile app team profiles (separate from web team subsystem; scoped for app UX)
-- Stripe gating: user_plans.plan = 'team' (checked in app; all users granted team for now)

CREATE TABLE IF NOT EXISTS public.user_plans (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'team' CHECK (plan IN ('free', 'team')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'New team',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_teams_owner_idx ON public.app_teams(owner_id);

CREATE TABLE IF NOT EXISTS public.app_team_admins (
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

CREATE TABLE IF NOT EXISTS public.app_team_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.app_teams(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'New group',
  age_from int CHECK (age_from IS NULL OR (age_from >= 1 AND age_from <= 130)),
  age_to int CHECK (age_to IS NULL OR (age_to >= 1 AND age_to <= 130)),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_team_groups_team_idx ON public.app_team_groups(team_id, sort_order);

CREATE TABLE IF NOT EXISTS public.app_team_athletes (
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

CREATE TABLE IF NOT EXISTS public.app_team_coaches (
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

-- Grant all existing auth users team plan access until Stripe is wired
INSERT INTO public.user_plans (user_id, plan)
SELECT id, 'team' FROM auth.users
ON CONFLICT (user_id) DO UPDATE SET plan = 'team', updated_at = now();

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_team_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_team_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_team_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_team_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_plans: self read" ON public.user_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "app_teams: owner all" ON public.app_teams
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "app_team_admins: team owner all" ON public.app_team_admins
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

CREATE POLICY "app_team_groups: team owner all" ON public.app_team_groups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

CREATE POLICY "app_team_athletes: team owner all" ON public.app_team_athletes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

CREATE POLICY "app_team_coaches: team owner all" ON public.app_team_coaches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );
