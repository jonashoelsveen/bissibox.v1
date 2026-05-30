
-- 1. meeting_invites: replace permissive SELECT with invitee/organizer-only access
DROP POLICY IF EXISTS "Meeting invites: read for authenticated" ON public.meeting_invites;

CREATE POLICY "Meeting invites: invitee or organizer read"
ON public.meeting_invites
FOR SELECT
TO authenticated
USING (
  lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = meeting_invites.event_id AND e.owner_id = auth.uid()
  )
);

-- 2. profiles: keep public read row policy, but remove anon column access to PII.
--    Anonymous (unauthenticated) visitors can still read non-sensitive columns,
--    but cannot read email/phone/address/emergency/birth_date/etc.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id,
  first_name,
  last_name,
  avatar_url,
  club,
  company_club,
  team,
  team_group,
  default_class,
  country,
  nationality,
  anonymous,
  account_type,
  athlete_active,
  is_photographer,
  photographer_active,
  photographer_bio,
  athlete_cover_media_id,
  photographer_cover_media_id,
  website,
  top_bar_color,
  mode,
  created_at,
  updated_at
) ON public.profiles TO anon;

-- 3. team_groups: keep public listing, but hide leader contact info from anon.
REVOKE SELECT ON public.team_groups FROM anon;
GRANT SELECT (
  id,
  team_id,
  name,
  age_from,
  age_to,
  sort_order,
  created_at,
  updated_at,
  description,
  is_default,
  color
) ON public.team_groups TO anon;
