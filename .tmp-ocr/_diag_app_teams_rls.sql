SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'app_teams';

SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy
WHERE polrelid = 'public.app_teams'::regclass
ORDER BY polname;

SELECT p.proname,
       p.prosecdef AS security_definer,
       l.lanname AS lang,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_app_team_admin',
    'is_app_team_owner',
    'is_app_team_member',
    'app_teams_assign_entity_code'
  )
ORDER BY p.proname;

SELECT tgname, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t
JOIN pg_class rel ON rel.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public' AND rel.relname = 'app_teams' AND NOT t.tgisinternal;

SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.app_team_admins'::regclass
ORDER BY polname;

SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.entity_members'::regclass
ORDER BY polname;
