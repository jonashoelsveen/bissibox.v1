-- Realtime DELETE on filtered channels needs the full old row (user_id,
-- app_team_id, entity_id). Without this, cross-device deletes are not
-- delivered to postgres_changes subscribers.
ALTER TABLE public.calendar_categories REPLICA IDENTITY FULL;
ALTER TABLE public.calendar_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'calendar_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_categories;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'calendar_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_sessions;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
