-- Profile cover image (separate per role-context)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS athlete_cover_media_id uuid,
  ADD COLUMN IF NOT EXISTS photographer_cover_media_id uuid;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS cover_media_id uuid,
  ADD COLUMN IF NOT EXISTS description_long text;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cover_media_id uuid,
  ADD COLUMN IF NOT EXISTS description text;

-- User follows (followers of athletes/photographers)
CREATE TABLE IF NOT EXISTS public.user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_role text NOT NULL CHECK (target_role IN ('athlete','photographer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, target_user_id, target_role)
);
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "UserFollows: public read" ON public.user_follows
  FOR SELECT TO public USING (true);
CREATE POLICY "UserFollows: self insert" ON public.user_follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "UserFollows: self delete" ON public.user_follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- Team follows
CREATE TABLE IF NOT EXISTS public.team_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, team_id)
);
ALTER TABLE public.team_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TeamFollows: public read" ON public.team_follows
  FOR SELECT TO public USING (true);
CREATE POLICY "TeamFollows: self insert" ON public.team_follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "TeamFollows: self delete" ON public.team_follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- Company follows
CREATE TABLE IF NOT EXISTS public.company_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, company_id)
);
ALTER TABLE public.company_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CompanyFollows: public read" ON public.company_follows
  FOR SELECT TO public USING (true);
CREATE POLICY "CompanyFollows: self insert" ON public.company_follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "CompanyFollows: self delete" ON public.company_follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- Team memberships (paid fan memberships, like race signup)
CREATE TABLE IF NOT EXISTS public.team_membership_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NOK',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_membership_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tiers: public read" ON public.team_membership_tiers
  FOR SELECT TO public USING (true);
CREATE POLICY "Tiers: owner all" ON public.team_membership_tiers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tier_id uuid REFERENCES public.team_membership_tiers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id, tier_id)
);
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Memberships: self read" ON public.team_memberships
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Memberships: team owner read" ON public.team_memberships
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()));
CREATE POLICY "Memberships: self insert" ON public.team_memberships
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Memberships: self delete" ON public.team_memberships
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Personal bests (manually entered for now; API import later)
CREATE TABLE IF NOT EXISTS public.personal_bests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  discipline text NOT NULL,
  performance text NOT NULL,
  achieved_on date,
  venue text,
  competition text,
  team text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.personal_bests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PB: public read of active athletes" ON public.personal_bests
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND p.athlete_active = true));
CREATE POLICY "PB: self read" ON public.personal_bests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "PB: self insert" ON public.personal_bests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "PB: self update" ON public.personal_bests
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "PB: self delete" ON public.personal_bests
  FOR DELETE TO authenticated USING (auth.uid() = user_id);