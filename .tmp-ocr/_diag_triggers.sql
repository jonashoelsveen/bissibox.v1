SELECT tgname, rel.relname
FROM pg_trigger t
JOIN pg_class rel ON rel.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND tgname LIKE '%broadcast%calendar%'
ORDER BY rel.relname, tgname;

SELECT
  (pg_get_functiondef('public.list_member_entity_calendar()'::regprocedure) LIKE '%mine_rows%') AS list_uses_all_member_rows,
  (pg_get_functiondef('public.can_view_entity_calendar_session(uuid,uuid)'::regprocedure) LIKE '%entity_member_groups%') AS view_uses_member_groups;
