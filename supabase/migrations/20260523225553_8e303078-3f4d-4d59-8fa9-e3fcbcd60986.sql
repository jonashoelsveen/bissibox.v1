DROP POLICY IF EXISTS "calendar_categories: delete" ON public.calendar_categories;

CREATE POLICY "calendar_categories: delete"
ON public.calendar_categories
FOR DELETE
USING (
  ((team_id IS NULL) AND (auth.uid() = user_id))
  OR ((team_id IS NOT NULL) AND (EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = calendar_categories.team_id AND t.owner_id = auth.uid()
  )))
);