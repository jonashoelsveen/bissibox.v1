-- Team 32, member jhoelsveen@gmail.com, sessions, visibility RPC.

SELECT id, name, owner_id, created_at
FROM public.app_teams
WHERE name ILIKE '%Team 32%' OR name ILIKE '%32%'
ORDER BY created_at DESC;

SELECT id, email
FROM auth.users
WHERE lower(email) = 'jhoelsveen@gmail.com';

SELECT em.id, em.team_id, em.user_id, em.email, em.status, em.app_group_id, t.name AS team_name
FROM public.entity_members em
LEFT JOIN public.app_teams t ON t.id = em.team_id
WHERE lower(em.email) = 'jhoelsveen@gmail.com'
   OR em.user_id = (SELECT id FROM auth.users WHERE lower(email) = 'jhoelsveen@gmail.com')
ORDER BY em.created_at DESC NULLS LAST;
