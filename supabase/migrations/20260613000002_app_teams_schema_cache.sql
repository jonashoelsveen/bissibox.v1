-- Ensure mobile team tables are exposed to Supabase API (PostgREST schema cache)
-- Idempotent: safe if 20260613000001_mobile_team_profiles.sql already ran partially or not at all.

-- ── Tables ────────────────────────────────────────────────────────────────────

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

-- Backfill team plan for existing users
INSERT INTO public.user_plans (user_id, plan)
SELECT id, 'team' FROM auth.users
ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_team_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_team_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_team_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_team_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_plans: self read" ON public.user_plans;
CREATE POLICY "user_plans: self read" ON public.user_plans
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_plans: self insert" ON public.user_plans;
CREATE POLICY "user_plans: self insert" ON public.user_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_plans: self update" ON public.user_plans;
CREATE POLICY "user_plans: self update" ON public.user_plans
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "app_teams: owner all" ON public.app_teams;
CREATE POLICY "app_teams: owner all" ON public.app_teams
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "app_team_admins: team owner all" ON public.app_team_admins;
CREATE POLICY "app_team_admins: team owner all" ON public.app_team_admins
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "app_team_groups: team owner all" ON public.app_team_groups;
CREATE POLICY "app_team_groups: team owner all" ON public.app_team_groups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "app_team_athletes: team owner all" ON public.app_team_athletes;
CREATE POLICY "app_team_athletes: team owner all" ON public.app_team_athletes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "app_team_coaches: team owner all" ON public.app_team_coaches;
CREATE POLICY "app_team_coaches: team owner all" ON public.app_team_coaches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "app_team_members: team owner all" ON public.app_team_members;
CREATE POLICY "app_team_members: team owner all" ON public.app_team_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

-- ── Grants (required for authenticated client access via PostgREST) ─────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_plans TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_teams TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_team_admins TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_team_groups TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_team_athletes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_team_coaches TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_team_members TO authenticated, service_role;

-- ── Auto team plan row for new signups ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user_team_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_plans (user_id, plan)
  VALUES (NEW.id, 'team')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_team_plan ON auth.users;
CREATE TRIGGER on_auth_user_created_team_plan
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_team_plan();

-- ── Reload PostgREST schema cache ─────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
