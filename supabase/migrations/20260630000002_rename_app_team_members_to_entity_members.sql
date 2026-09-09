-- Rename app_team_members → entity_members (entity-scoped roster, not only "teams").
-- Ensures date_of_birth and profile columns exist for entity page saves.

-- Profile columns on admins (entity page administrators).
ALTER TABLE public.app_team_admins
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE public.app_team_admins DROP CONSTRAINT IF EXISTS app_team_admins_status_check;
ALTER TABLE public.app_team_admins
  ADD CONSTRAINT app_team_admins_status_check
  CHECK (status IN ('pending', 'active', 'roster'));

DO $$
BEGIN
  IF to_regclass('public.app_team_members') IS NOT NULL THEN
    ALTER TABLE public.app_team_members
      ADD COLUMN IF NOT EXISTS first_name text,
      ADD COLUMN IF NOT EXISTS last_name text,
      ADD COLUMN IF NOT EXISTS sex text,
      ADD COLUMN IF NOT EXISTS date_of_birth date,
      ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT '';

    ALTER TABLE public.app_team_members DROP CONSTRAINT IF EXISTS app_team_members_status_check;
    ALTER TABLE public.app_team_members
      ADD CONSTRAINT app_team_members_status_check
      CHECK (status IN ('pending', 'active', 'roster'));

    ALTER TABLE public.app_team_members ALTER COLUMN email DROP NOT NULL;
    ALTER TABLE public.app_team_members DROP CONSTRAINT IF EXISTS app_team_members_team_id_email_key;
    DROP INDEX IF EXISTS public.app_team_members_team_email_unique;

    CREATE UNIQUE INDEX IF NOT EXISTS app_team_members_team_email_unique
      ON public.app_team_members (team_id, lower(email))
      WHERE email IS NOT NULL AND btrim(email) <> '';

    ALTER TABLE public.app_team_members RENAME TO entity_members;
  END IF;
END $$;

-- Idempotent profile columns when rename already applied.
ALTER TABLE public.entity_members
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT '';

ALTER TABLE public.entity_members DROP CONSTRAINT IF EXISTS app_team_members_status_check;
ALTER TABLE public.entity_members DROP CONSTRAINT IF EXISTS entity_members_status_check;
ALTER TABLE public.entity_members
  ADD CONSTRAINT entity_members_status_check
  CHECK (status IN ('pending', 'active', 'roster'));

ALTER TABLE public.entity_members ALTER COLUMN email DROP NOT NULL;

DROP INDEX IF EXISTS public.app_team_members_team_email_unique;
DROP INDEX IF EXISTS public.entity_members_team_email_unique;
CREATE UNIQUE INDEX IF NOT EXISTS entity_members_team_email_unique
  ON public.entity_members (team_id, lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

ALTER INDEX IF EXISTS app_team_members_group_idx RENAME TO entity_members_group_idx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_team_members_pkey'
      AND conrelid = 'public.entity_members'::regclass
  ) THEN
    ALTER TABLE public.entity_members RENAME CONSTRAINT app_team_members_pkey TO entity_members_pkey;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_team_members_team_id_fkey'
      AND conrelid = 'public.entity_members'::regclass
  ) THEN
    ALTER TABLE public.entity_members
      RENAME CONSTRAINT app_team_members_team_id_fkey TO entity_members_team_id_fkey;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_team_members_user_id_fkey'
      AND conrelid = 'public.entity_members'::regclass
  ) THEN
    ALTER TABLE public.entity_members
      RENAME CONSTRAINT app_team_members_user_id_fkey TO entity_members_user_id_fkey;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_team_members_app_group_id_fkey'
      AND conrelid = 'public.entity_members'::regclass
  ) THEN
    ALTER TABLE public.entity_members
      RENAME CONSTRAINT app_team_members_app_group_id_fkey TO entity_members_app_group_id_fkey;
  END IF;
END $$;

DROP POLICY IF EXISTS "app_team_members: team owner all" ON public.entity_members;
CREATE POLICY "entity_members: team owner all" ON public.entity_members
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "app_team_members: admin select" ON public.entity_members;
DROP POLICY IF EXISTS "entity_members: admin select" ON public.entity_members;
CREATE POLICY "entity_members: admin select" ON public.entity_members
  FOR SELECT TO authenticated
  USING (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_members: admin insert" ON public.entity_members;
DROP POLICY IF EXISTS "entity_members: admin insert" ON public.entity_members;
CREATE POLICY "entity_members: admin insert" ON public.entity_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_members: admin update" ON public.entity_members;
DROP POLICY IF EXISTS "entity_members: admin update" ON public.entity_members;
CREATE POLICY "entity_members: admin update" ON public.entity_members
  FOR UPDATE TO authenticated
  USING (public.is_app_team_admin(team_id))
  WITH CHECK (public.is_app_team_admin(team_id));

DROP POLICY IF EXISTS "app_team_members: admin delete" ON public.entity_members;
DROP POLICY IF EXISTS "entity_members: admin delete" ON public.entity_members;
CREATE POLICY "entity_members: admin delete" ON public.entity_members
  FOR DELETE TO authenticated
  USING (public.is_app_team_admin(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_members TO authenticated, service_role;

-- ── Rename member ↔ group junction (references entity_members) ──────────────

DO $$
BEGIN
  IF to_regclass('public.app_team_member_groups') IS NOT NULL THEN
    ALTER TABLE public.app_team_member_groups RENAME TO entity_member_groups;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.entity_member_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.app_teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.entity_members(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.app_team_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, group_id)
);

ALTER TABLE public.entity_member_groups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.app_team_member_groups_team_idx') IS NOT NULL
     AND to_regclass('public.entity_member_groups_team_idx') IS NULL THEN
    ALTER INDEX public.app_team_member_groups_team_idx RENAME TO entity_member_groups_team_idx;
  ELSIF to_regclass('public.app_team_member_groups_team_idx') IS NOT NULL
     AND to_regclass('public.entity_member_groups_team_idx') IS NOT NULL THEN
    DROP INDEX public.app_team_member_groups_team_idx;
  END IF;

  IF to_regclass('public.app_team_member_groups_member_idx') IS NOT NULL
     AND to_regclass('public.entity_member_groups_member_idx') IS NULL THEN
    ALTER INDEX public.app_team_member_groups_member_idx RENAME TO entity_member_groups_member_idx;
  ELSIF to_regclass('public.app_team_member_groups_member_idx') IS NOT NULL
     AND to_regclass('public.entity_member_groups_member_idx') IS NOT NULL THEN
    DROP INDEX public.app_team_member_groups_member_idx;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS entity_member_groups_team_idx
  ON public.entity_member_groups (team_id);

CREATE INDEX IF NOT EXISTS entity_member_groups_member_idx
  ON public.entity_member_groups (member_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_team_member_groups_pkey'
      AND conrelid = 'public.entity_member_groups'::regclass
  ) THEN
    ALTER TABLE public.entity_member_groups
      RENAME CONSTRAINT app_team_member_groups_pkey TO entity_member_groups_pkey;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_team_member_groups_member_id_group_id_key'
      AND conrelid = 'public.entity_member_groups'::regclass
  ) THEN
    ALTER TABLE public.entity_member_groups
      RENAME CONSTRAINT app_team_member_groups_member_id_group_id_key TO entity_member_groups_member_id_group_id_key;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_team_member_groups_team_id_fkey'
      AND conrelid = 'public.entity_member_groups'::regclass
  ) THEN
    ALTER TABLE public.entity_member_groups
      RENAME CONSTRAINT app_team_member_groups_team_id_fkey TO entity_member_groups_team_id_fkey;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_team_member_groups_group_id_fkey'
      AND conrelid = 'public.entity_member_groups'::regclass
  ) THEN
    ALTER TABLE public.entity_member_groups
      RENAME CONSTRAINT app_team_member_groups_group_id_fkey TO entity_member_groups_group_id_fkey;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_team_member_groups_member_id_fkey'
      AND conrelid = 'public.entity_member_groups'::regclass
  ) THEN
    ALTER TABLE public.entity_member_groups
      RENAME CONSTRAINT app_team_member_groups_member_id_fkey TO entity_member_groups_member_id_fkey;
  END IF;
END $$;

DROP POLICY IF EXISTS "app_team_member_groups: team owner all" ON public.entity_member_groups;
CREATE POLICY "entity_member_groups: team owner all" ON public.entity_member_groups
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "app_team_member_groups: admin all" ON public.entity_member_groups;
DROP POLICY IF EXISTS "entity_member_groups: admin all" ON public.entity_member_groups;
CREATE POLICY "entity_member_groups: admin all" ON public.entity_member_groups
  FOR ALL TO authenticated
  USING (public.is_app_team_admin(team_id))
  WITH CHECK (public.is_app_team_admin(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_member_groups TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
