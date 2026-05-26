
-- Add invitation token fields to user_coaches for the email-based accept flow
ALTER TABLE public.user_coaches
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS user_coaches_invite_token_uidx
  ON public.user_coaches (invite_token)
  WHERE invite_token IS NOT NULL;

-- Helper: is the current user an accepted coach of _member?
CREATE OR REPLACE FUNCTION public.is_coach_of_member(_member uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_coaches
    WHERE owner_id = _member
      AND status = 'accepted'
      AND coach_user_id = auth.uid()
  );
$$;

-- Extend viewer-role helpers to recognize coach relationships.
CREATE OR REPLACE FUNCTION public.can_view_member(_member uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_annotate_member(_member)
      OR public.is_follower_of_member(_member)
      OR public.is_coach_of_member(_member);
$$;

CREATE OR REPLACE FUNCTION public.get_member_viewer_role(_member uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _member = auth.uid() THEN 'owner'
    WHEN public.is_group_leader_of_member(_member) THEN 'leader'
    WHEN public.is_coach_of_member(_member) THEN 'leader'
    WHEN public.is_active_follower_of_member(_member) THEN 'active_follower'
    WHEN public.is_follower_of_member(_member) THEN 'follower'
    ELSE 'none'
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_member_viewer_role_for_leader(_member uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_group_leader_of_member(_member) THEN 'leader'
    WHEN public.is_coach_of_member(_member) THEN 'leader'
    WHEN public.is_active_follower_of_member(_member) THEN 'active_follower'
    WHEN public.is_follower_of_member(_member) THEN 'follower'
    ELSE 'none'
  END;
$$;
