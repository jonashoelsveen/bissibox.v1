SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'list_visible_calendar_sessions',
    'list_visible_calendar_sessions_for',
    'list_member_entity_calendar',
    'list_member_entity_calendar_for',
    'can_view_entity_calendar_session'
  )
ORDER BY 1, 2;
