SELECT cs.entity_id,
       cs.app_group_id IS NULL AS all_members,
       left(cs.title, 48) AS title,
       EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = cs.entity_id) AS team_exists,
       (SELECT COUNT(*) FROM public.entity_members em WHERE em.team_id = cs.entity_id AND em.status IN ('active','roster')) AS members_on_that_team
FROM public.calendar_sessions cs
WHERE cs.entity_id IS NOT NULL;
