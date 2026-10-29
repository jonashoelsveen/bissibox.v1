-- Soft-delete sets deleted_at, and user_calendar_role() only returns a role
-- while deleted_at is null. The update WITH CHECK then rejects the new row,
-- so the calendar stays live and comes back after reload.

DROP POLICY IF EXISTS "uc: update admin" ON public.user_calendars;

CREATE POLICY "uc: update admin"
  ON public.user_calendars FOR UPDATE TO authenticated
  USING (public.user_calendar_role(id) = 'admin')
  WITH CHECK (
    public.user_calendar_role(id) = 'admin'
    OR (
      deleted_at IS NOT NULL
      AND (
        owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.user_calendar_members m
          WHERE m.calendar_id = user_calendars.id
            AND m.user_id = auth.uid()
            AND m.role = 'admin'
            AND m.status = 'accepted'
        )
      )
    )
  );
