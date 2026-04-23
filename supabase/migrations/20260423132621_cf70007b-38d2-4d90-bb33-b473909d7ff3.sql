-- Enum for account types and roles
DO $$ BEGIN
  CREATE TYPE public.account_type AS ENUM ('individual', 'team');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('organizer', 'photographer', 'timekeeper');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.company_kind AS ENUM ('timing', 'production');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- profiles.account_type
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type public.account_type NOT NULL DEFAULT 'individual';

-- companies (timing + production)
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.company_kind NOT NULL,
  name text NOT NULL,
  logo_url text,
  website text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Companies: public read" ON public.companies FOR SELECT USING (true);

-- user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "UserRoles: own read" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "UserRoles: own insert" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "UserRoles: own delete" ON public.user_roles FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "UserRoles: own update" ON public.user_roles FOR UPDATE USING (auth.uid() = user_id);

-- has_role helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- teams
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  nif_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teams: public read" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Teams: owner insert" ON public.teams FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Teams: owner update" ON public.teams FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Teams: owner delete" ON public.teams FOR DELETE USING (auth.uid() = owner_id);

CREATE TRIGGER teams_touch_updated BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- team_members
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TeamMembers: self or team-owner read" ON public.team_members FOR SELECT
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()));
CREATE POLICY "TeamMembers: team-owner insert" ON public.team_members FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()));
CREATE POLICY "TeamMembers: self update accepted" ON public.team_members FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "TeamMembers: self or owner delete" ON public.team_members FOR DELETE
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()));

-- Seed timing companies
INSERT INTO public.companies (kind, name, website) VALUES
  ('timing', 'EQ Timing', 'https://eqtiming.com'),
  ('timing', 'Race Result', 'https://www.raceresult.com')
ON CONFLICT DO NOTHING;