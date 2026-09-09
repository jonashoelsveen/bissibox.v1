SELECT LEFT(cs.id::text, 8) AS id8,
       LEFT(cs.entity_id::text, 8) AS entity8,
       LEFT(cs.user_id::text, 8) AS owner8,
       cs.app_group_id IS NULL AS is_all,
       length(cs.title) AS title_len,
       EXISTS (SELECT 1 FROM public.app_teams t WHERE t.id = cs.entity_id) AS entity_is_team
FROM public.calendar_sessions cs
WHERE cs.entity_id IS NOT NULL
ORDER BY cs.starts_at DESC
LIMIT 20;
