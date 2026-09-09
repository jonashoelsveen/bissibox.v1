SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'public.calendar_sessions'::regclass
ORDER BY polname;
