
-- Fix: restrict is_media_in_team_profile_album to team-scoped Profile albums only.
-- A user creating a personal album named 'Profile' should NOT make media public.
CREATE OR REPLACE FUNCTION public.is_media_in_team_profile_album(_media_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.media_item_albums mia
    JOIN public.media_albums a ON a.id = mia.album_id
    WHERE mia.media_item_id = _media_id
      AND a.name = 'Profile'
      AND a.team_id IS NOT NULL
  );
$function$;

-- Fix: meeting_audience SELECT was USING (true). Restrict to event organizer
-- or members of the linked group.
DROP POLICY IF EXISTS "Meeting audience: read for event viewers" ON public.meeting_audience;

CREATE POLICY "Meeting audience: organizer or group member read"
ON public.meeting_audience
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = meeting_audience.event_id
      AND e.owner_id = auth.uid()
  )
  OR (
    meeting_audience.group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_group_members m
      WHERE m.group_id = meeting_audience.group_id
        AND m.user_id = auth.uid()
    )
  )
);
