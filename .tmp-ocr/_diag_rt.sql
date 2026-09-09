SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'realtime' AND p.proname = 'send'
) AS has_realtime_send;
