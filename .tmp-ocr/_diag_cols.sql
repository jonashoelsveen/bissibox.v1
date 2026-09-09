SELECT entity_id, count(*) FROM public.calendar_sessions WHERE entity_id IS NOT NULL GROUP BY entity_id;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'calendar_sessions'
ORDER BY ordinal_position;
