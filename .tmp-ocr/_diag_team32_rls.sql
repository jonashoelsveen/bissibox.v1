SELECT polname, polcmd, polroles::regrole[] AS roles, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.calendar_sessions'::regclass
ORDER BY polname;

SELECT proname, prosecdef,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'list_visible_calendar_sessions',
    'list_visible_calendar_sessions_for',
    'can_view_entity_calendar_session',
    'list_member_entity_calendar'
  )
ORDER BY proname;
