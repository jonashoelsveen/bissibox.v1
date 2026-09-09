SELECT COUNT(*) AS entity_sessions,
       COUNT(*) FILTER (WHERE app_group_id IS NULL) AS all_members,
       COUNT(*) FILTER (WHERE app_group_id IS NOT NULL) AS group_scoped
FROM public.calendar_sessions
WHERE entity_id IS NOT NULL;
