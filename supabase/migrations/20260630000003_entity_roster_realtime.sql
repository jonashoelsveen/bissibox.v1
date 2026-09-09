-- Realtime sync for entity roster (web /entity ↔ mobile team page).
-- REPLICA IDENTITY FULL so DELETE events include team_id for filtered channels.

ALTER TABLE public.app_team_admins REPLICA IDENTITY FULL;
ALTER TABLE public.app_team_groups REPLICA IDENTITY FULL;
ALTER TABLE public.entity_members REPLICA IDENTITY FULL;
ALTER TABLE public.entity_member_groups REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_team_admins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_team_admins;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_team_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_team_groups;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'entity_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entity_members;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'entity_member_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entity_member_groups;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
