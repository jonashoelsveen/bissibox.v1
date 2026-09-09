-- Entity page roster: profile fields on app_team admins/members and
-- many-to-many member ↔ group links. Idempotent for existing deployments.

-- ── Profile columns (roster rows may exist before invite/signup) ─────────────

ALTER TABLE public.app_team_admins
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE public.app_team_members
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT '';

-- Roster rows exist before invite/signup flows are wired.
ALTER TABLE public.app_team_admins DROP CONSTRAINT IF EXISTS app_team_admins_status_check;
ALTER TABLE public.app_team_admins
  ADD CONSTRAINT app_team_admins_status_check
  CHECK (status IN ('pending', 'active', 'roster'));

ALTER TABLE public.app_team_members DROP CONSTRAINT IF EXISTS app_team_members_status_check;
ALTER TABLE public.app_team_members
  ADD CONSTRAINT app_team_members_status_check
  CHECK (status IN ('pending', 'active', 'roster'));

-- Email is optional until an invite is sent.
ALTER TABLE public.app_team_admins ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.app_team_members ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.app_team_admins DROP CONSTRAINT IF EXISTS app_team_admins_team_id_email_key;
ALTER TABLE public.app_team_members DROP CONSTRAINT IF EXISTS app_team_members_team_id_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS app_team_admins_team_email_unique
  ON public.app_team_admins (team_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS app_team_members_team_email_unique
  ON public.app_team_members (team_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

-- ── Member ↔ group (entity page allows multiple groups per member) ───────────

CREATE TABLE IF NOT EXISTS public.app_team_member_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.app_teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.app_team_members(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.app_team_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, group_id)
);

CREATE INDEX IF NOT EXISTS app_team_member_groups_team_idx
  ON public.app_team_member_groups (team_id);

CREATE INDEX IF NOT EXISTS app_team_member_groups_member_idx
  ON public.app_team_member_groups (member_id);

ALTER TABLE public.app_team_member_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_team_member_groups: team owner all" ON public.app_team_member_groups;
CREATE POLICY "app_team_member_groups: team owner all" ON public.app_team_member_groups
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "app_team_member_groups: admin all" ON public.app_team_member_groups;
CREATE POLICY "app_team_member_groups: admin all" ON public.app_team_member_groups
  FOR ALL TO authenticated
  USING (public.is_app_team_admin(team_id))
  WITH CHECK (public.is_app_team_admin(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_team_member_groups TO authenticated, service_role;

-- ── Active admins may manage roster (not only owner) ─────────────────────────

DROP POLICY IF EXISTS "app_team_admins: admin select" ON public.app_team_admins;
CREATE POLICY "app_team_admins: admin select" ON public.app_team_admins
  FOR SELECT TO authenticated
  USING (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_admins: admin insert" ON public.app_team_admins;
CREATE POLICY "app_team_admins: admin insert" ON public.app_team_admins
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_admins: admin update" ON public.app_team_admins;
CREATE POLICY "app_team_admins: admin update" ON public.app_team_admins
  FOR UPDATE TO authenticated
  USING (public.is_app_team_admin(team_id))
  WITH CHECK (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_admins: admin delete" ON public.app_team_admins;
CREATE POLICY "app_team_admins: admin delete" ON public.app_team_admins
  FOR DELETE TO authenticated
  USING (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_members: admin select" ON public.app_team_members;
CREATE POLICY "app_team_members: admin select" ON public.app_team_members
  FOR SELECT TO authenticated
  USING (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_members: admin insert" ON public.app_team_members;
CREATE POLICY "app_team_members: admin insert" ON public.app_team_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_members: admin update" ON public.app_team_members;
CREATE POLICY "app_team_members: admin update" ON public.app_team_members
  FOR UPDATE TO authenticated
  USING (public.is_app_team_admin(team_id))
  WITH CHECK (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_members: admin delete" ON public.app_team_members;
CREATE POLICY "app_team_members: admin delete" ON public.app_team_members
  FOR DELETE TO authenticated
  USING (public.is_app_team_admin(team_id));

NOTIFY pgrst, 'reload schema';
