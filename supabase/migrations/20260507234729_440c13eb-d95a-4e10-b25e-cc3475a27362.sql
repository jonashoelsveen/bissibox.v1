-- Allow group leaders to read members of groups they lead.
CREATE POLICY "TeamGroupMembers: group leader read"
ON public.team_group_members
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_group_leaders l
    WHERE l.group_id = team_group_members.group_id
      AND (
        l.user_id = auth.uid()
        OR lower(l.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      )
  )
);

-- Also allow group leaders to read the profiles of members in groups they lead,
-- so names/avatars appear on the Group Members page.
CREATE POLICY "Profiles: group leader read members"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.team_group_members m
    JOIN public.team_group_leaders l ON l.group_id = m.group_id
    WHERE m.user_id = profiles.id
      AND (
        l.user_id = auth.uid()
        OR lower(l.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      )
  )
);