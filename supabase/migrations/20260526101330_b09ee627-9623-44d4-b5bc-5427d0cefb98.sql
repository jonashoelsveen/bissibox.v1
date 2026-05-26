-- Allow any accepted coach to read the owner's personal calendar categories.
CREATE POLICY "calendar_categories: coach select all"
ON public.calendar_categories FOR SELECT
USING (
  team_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.user_coaches uc
    WHERE uc.owner_id = calendar_categories.user_id
      AND uc.coach_user_id = auth.uid()
      AND uc.status = 'accepted'
  )
);

-- Coaches with calendar_access='edit' may create/update sessions across all of
-- the owner's categories (the per-category grant table is no longer used as
-- a gate; coaches always see the full category list).
CREATE OR REPLACE FUNCTION public.coach_can_edit_owner_category(_owner uuid, _category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_coaches uc
    WHERE uc.owner_id = _owner
      AND uc.coach_user_id = auth.uid()
      AND uc.status = 'accepted'
      AND uc.calendar_access = 'edit'
  );
$$;