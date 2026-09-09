SELECT 'app_teams' AS src, id::text, name
FROM public.app_teams
WHERE id = '6001ef00-3fb0-45ca-8f1d-ff527aa656f8'
UNION ALL
SELECT 'entity_members.team_id', team_id::text, status
FROM public.entity_members
WHERE team_id = '6001ef00-3fb0-45ca-8f1d-ff527aa656f8'
UNION ALL
SELECT 'app_team_admins.team_id', team_id::text, status
FROM public.app_team_admins
WHERE team_id = '6001ef00-3fb0-45ca-8f1d-ff527aa656f8'
LIMIT 20;

SELECT id, name, owner_id IS NOT NULL AS has_owner
FROM public.app_teams
ORDER BY created_at DESC
LIMIT 20;

SELECT DISTINCT entity_id
FROM public.calendar_sessions
WHERE entity_id IS NOT NULL;
