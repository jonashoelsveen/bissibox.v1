SELECT proname,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'list_member_entity_calendar',
    'can_view_entity_calendar_session',
    'is_app_team_member',
    'upsert_entity_calendar_session'
  )
ORDER BY proname;

SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'realtime' AND p.proname = 'send'
) AS has_realtime_send;

SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.calendar_sessions'::regclass
ORDER BY polname;

SELECT COUNT(*) AS entity_sessions,
       COUNT(*) FILTER (WHERE app_group_id IS NULL) AS all_members,
       COUNT(*) FILTER (WHERE app_group_id IS NOT NULL) AS group_scoped
FROM public.calendar_sessions
WHERE entity_id IS NOT NULL;

SELECT status, COUNT(*) AS n,
       COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS with_user,
       COUNT(*) FILTER (WHERE app_group_id IS NOT NULL) AS with_app_group
FROM public.entity_members
GROUP BY status
ORDER BY status;

SELECT
  (SELECT COUNT(*) FROM public.entity_member_groups) AS member_group_links,
  (SELECT COUNT(*) FROM public.app_team_groups WHERE deleted_at IS NULL) AS groups;

SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('calendar_sessions', 'entity_members', 'entity_member_groups');
