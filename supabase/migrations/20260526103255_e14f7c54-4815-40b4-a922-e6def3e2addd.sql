DROP POLICY IF EXISTS "calendar_categories: coach select all" ON public.calendar_categories;
DROP POLICY IF EXISTS "calendar_categories: granted coach select" ON public.calendar_categories;

CREATE POLICY "calendar_categories: granted coach select"
  ON public.calendar_categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.calendar_category_coach_access a
      WHERE a.category_id = calendar_categories.id
        AND a.coach_user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.coach_can_edit_owner_category(
  _owner uuid,
  _category_id uuid
) RETURNS boolean
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
  )
  AND (
    _category_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.calendar_category_coach_access a
      WHERE a.owner_id = _owner
        AND a.coach_user_id = auth.uid()
        AND a.category_id = _category_id
    )
  );
$$;