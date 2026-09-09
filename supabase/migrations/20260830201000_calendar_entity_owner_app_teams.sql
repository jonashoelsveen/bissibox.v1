-- "cs: entity owner all" still referenced the dropped/legacy public.teams table,
-- so owner ALL never matched app_teams rows. Admin writes already go through
-- "cs: owner insert" / "cs: app team admin all"; this aligns the owner policy
-- with the current entity model.

DROP POLICY IF EXISTS "cs: entity owner all" ON public.calendar_sessions;
CREATE POLICY "cs: entity owner all"
  ON public.calendar_sessions
  FOR ALL
  TO authenticated
  USING (
    entity_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.app_teams t
      WHERE t.id = calendar_sessions.entity_id AND t.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    entity_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.app_teams t
      WHERE t.id = calendar_sessions.entity_id AND t.owner_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
