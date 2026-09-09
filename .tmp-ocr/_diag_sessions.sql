SELECT
  (SELECT count(*) FROM public.app_teams) AS teams,
  (SELECT count(*) FROM public.calendar_sessions WHERE entity_id IN (SELECT id FROM public.app_teams)) AS entity_sessions_on_teams,
  (SELECT count(*) FROM public.calendar_sessions WHERE entity_id IS NOT NULL) AS entity_sessions_any,
  (SELECT max(created_at) FROM public.calendar_sessions) AS newest_created;

SELECT id, entity_id, app_group_id, title, created_at
FROM public.calendar_sessions
WHERE entity_id IS NOT NULL
ORDER BY created_at DESC NULLS LAST
LIMIT 10;

SELECT id, name FROM public.app_teams ORDER BY created_at;
