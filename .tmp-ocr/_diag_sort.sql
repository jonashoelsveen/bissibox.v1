SELECT column_name, data_type, numeric_precision
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'calendar_sessions'
  AND column_name IN ('sort_index','starts_at','entity_id','app_group_id','id');
