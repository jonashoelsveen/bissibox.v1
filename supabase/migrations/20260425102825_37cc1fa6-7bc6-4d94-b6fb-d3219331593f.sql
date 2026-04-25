
ALTER TABLE public.team_membership_tiers
  ADD COLUMN IF NOT EXISTS group_assignment_mode text NOT NULL DEFAULT 'volunteer',
  ADD COLUMN IF NOT EXISTS criteria_label text NOT NULL DEFAULT 'age';

ALTER TABLE public.team_groups
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS leader_name text,
  ADD COLUMN IF NOT EXISTS leader_email text,
  ADD COLUMN IF NOT EXISTS leader_phone text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

ALTER TABLE public.team_memberships
  ADD COLUMN IF NOT EXISTS group_id uuid;

-- Allow self-insertion of one's own group membership (edge function uses service role,
-- but this also allows clients in future). Edge function uses service role so no
-- new policy required for it; keep things tight.

-- Allow public read of group_members count would expose data; skip.
