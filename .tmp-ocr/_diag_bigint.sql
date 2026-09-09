SELECT pg_get_functiondef('public.upsert_entity_calendar_session(jsonb)'::regprocedure) LIKE '%::bigint%' AS sort_index_is_bigint;
