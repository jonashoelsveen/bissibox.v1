SELECT
  (SELECT COUNT(*) FROM public.calendar_sessions WHERE entity_id IS NOT NULL) AS entity_sessions,
  (SELECT COUNT(*) FROM public.calendar_sessions WHERE entity_id IS NOT NULL AND app_group_id IS NULL) AS entity_all_group,
  (SELECT COUNT(*) FROM public.calendar_sessions WHERE entity_id IS NOT NULL AND app_group_id IS NOT NULL) AS entity_scoped,
  (SELECT COUNT(*) FROM public.entity_members WHERE status IN ('active', 'roster')) AS live_members,
  (SELECT COUNT(*) FROM public.entity_members WHERE status IN ('active', 'roster') AND user_id IS NOT NULL) AS linked_members;
