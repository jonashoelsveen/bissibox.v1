SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'list_visible_calendar_sessions',
  'list_visible_calendar_sessions_for',
  'list_member_entity_calendar',
  'list_member_entity_calendar_for',
  'can_view_entity_calendar_session'
)
ORDER BY 1, 2, 3;

SELECT
  (SELECT COUNT(*) FROM public.calendar_sessions WHERE entity_id IS NOT NULL) AS entity_sessions,
  (SELECT COUNT(*) FROM public.calendar_sessions WHERE entity_id IS NOT NULL AND app_group_id IS NULL) AS entity_all_group,
  (SELECT COUNT(*) FROM public.calendar_sessions WHERE entity_id IS NOT NULL AND app_group_id IS NOT NULL) AS entity_scoped,
  (SELECT COUNT(*) FROM public.entity_members WHERE status IN ('active', 'roster')) AS live_members,
  (SELECT COUNT(*) FROM public.entity_members WHERE status IN ('active', 'roster') AND user_id IS NOT NULL) AS linked_members,
  (SELECT COUNT(*) FROM public.entity_members WHERE status = 'roster') AS roster_members,
  (SELECT COUNT(*) FROM public.entity_members WHERE status = 'active') AS active_members;

SELECT em.status,
       COUNT(*) AS members,
       COUNT(*) FILTER (WHERE em.user_id IS NOT NULL) AS linked,
       COUNT(DISTINCT em.team_id) AS teams
FROM public.entity_members em
GROUP BY em.status
ORDER BY em.status;
