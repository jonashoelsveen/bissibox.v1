-- Team 32 sessions + visibility RPC for jhoelsveen.

SELECT id, name, owner_id
FROM public.app_teams
WHERE id = '5171c598-d027-40bd-888a-e479437a283c';

SELECT id, entity_id, app_group_id, user_id, left(title, 60) AS title, starts_at, created_at
FROM public.calendar_sessions
WHERE entity_id = '5171c598-d027-40bd-888a-e479437a283c'
ORDER BY starts_at DESC
LIMIT 30;

SELECT COUNT(*) AS session_count,
       COUNT(*) FILTER (WHERE app_group_id IS NULL) AS all_group,
       COUNT(*) FILTER (WHERE app_group_id IS NOT NULL) AS scoped
FROM public.calendar_sessions
WHERE entity_id = '5171c598-d027-40bd-888a-e479437a283c';
