CREATE POLICY "calendar_categories: granted coach select"
  ON public.calendar_categories
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.calendar_category_coach_access a
    WHERE a.category_id = calendar_categories.id
      AND a.coach_user_id = auth.uid()
  ));
