-- 1) Add team_id to media_items
ALTER TABLE public.media_items
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_items_team_id ON public.media_items(team_id);

-- 2) Backfill: items uploaded in team/organizer mode by a team owner -> link to that team
UPDATE public.media_items mi
SET team_id = t.id
FROM public.teams t
WHERE mi.team_id IS NULL
  AND t.owner_id = mi.user_id
  AND mi.uploaded_in_mode IN ('team', 'organizer');

-- 3) RLS: team owners can fully manage media belonging to their team
DROP POLICY IF EXISTS "Media: team owner all" ON public.media_items;
CREATE POLICY "Media: team owner all"
ON public.media_items
FOR ALL
TO authenticated
USING (
  team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = media_items.team_id AND t.owner_id = auth.uid()
  )
)
WITH CHECK (
  team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = media_items.team_id AND t.owner_id = auth.uid()
  )
);

-- 4) Public read of items that belong to a team's "Profile" album
DROP POLICY IF EXISTS "Media: team profile public read" ON public.media_items;
CREATE POLICY "Media: team profile public read"
ON public.media_items
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.media_item_albums mia
    JOIN public.media_albums a ON a.id = mia.album_id
    WHERE mia.media_item_id = media_items.id
      AND a.team_id IS NOT NULL
      AND a.name = 'Profile'
  )
);

-- 5) Stop auto-creating a team Profile album (was cluttering personal album list).
--    Existing team Profile albums remain — we just stop creating new ones automatically.
DROP TRIGGER IF EXISTS trg_create_default_team_profile_album ON public.teams;
DROP FUNCTION IF EXISTS public.create_default_team_profile_album();